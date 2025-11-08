/**
 * SettingsManager Service
 *
 * Manages user settings stored in a Google Sheet in the user's Drive.
 * Settings are cached in localStorage for fast access.
 *
 * The Google Sheet is named "ScreenMark Settings" and contains:
 * - Column A: Setting key (e.g., "gemini_api_key")
 * - Column B: Setting value
 */

interface GapiClient {
  init(config: { apiKey: string | undefined; discoveryDocs: string[] }): Promise<void>;
  sheets: {
    spreadsheets: {
      get(params: { spreadsheetId: string }): Promise<{ result: { spreadsheetId: string } }>;
      create(params: { resource: unknown }): Promise<{ result: { spreadsheetId: string } }>;
      values: {
        get(params: { spreadsheetId: string; range: string }): Promise<{ result: { values?: string[][] } }>;
        update(params: {
          spreadsheetId: string;
          range: string;
          valueInputOption: string;
          resource: { values: string[][] };
        }): Promise<{ result: unknown }>;
        append(params: {
          spreadsheetId: string;
          range: string;
          valueInputOption: string;
          resource: { values: string[][] };
        }): Promise<{ result: unknown }>;
      };
    };
  };
  drive: {
    files: {
      list(params: { q: string; fields: string; pageSize: number }): Promise<{ result: { files?: { id: string; name: string }[] } }>;
    };
  };
}

interface Gapi {
  load(libraries: string, callback: () => void): void;
  auth: {
    setToken(token: { access_token: string }): void;
    getToken(): { access_token: string };
  };
  client: GapiClient;
}

declare const gapi: Gapi;


const SETTINGS_SHEET_NAME = 'ScreenMark Settings';
const CACHE_PREFIX = 'screenmark_settings_';
const SPREADSHEET_ID_KEY = 'screenmark_spreadsheet_id';

export class SettingsManager {
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private spreadsheetId: string | null = null;

  /**
   * Initialize the Google Sheets API
   */
  async initialize(accessToken: string): Promise<void> {
    if (this.isInitialized) return;

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const initGapi = () => {
        gapi.load('client', async () => {
          try {
            await gapi.client.init({
              apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
              discoveryDocs: [
                'https://sheets.googleapis.com/$discovery/rest?version=v4',
                'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
              ],
            });

            gapi.auth.setToken({
              access_token: accessToken,
            });

            this.isInitialized = true;
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      };

      // Check if gapi is already loaded
      if (window.gapi) {
        initGapi();
        return;
      }

      // Load gapi script
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = initGapi;
      script.onerror = reject;
      document.body.appendChild(script);
    });

    return this.initPromise;
  }

  /**
   * Find or create the settings spreadsheet
   */
  private async getOrCreateSpreadsheet(): Promise<string> {
    // Check cache first
    const cachedId = localStorage.getItem(SPREADSHEET_ID_KEY);
    if (cachedId) {
      // Verify it still exists
      try {
        await gapi.client.sheets.spreadsheets.get({
          spreadsheetId: cachedId,
        });
        this.spreadsheetId = cachedId;
        return cachedId;
      } catch (error) {
        // Cached spreadsheet not found, will create new one
        localStorage.removeItem(SPREADSHEET_ID_KEY);
      }
    }

    // Search for existing spreadsheet
    try {
      const response = await gapi.client.drive.files.list({
        q: `name='${SETTINGS_SHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
        fields: 'files(id, name)',
        pageSize: 1,
      });

      if (response.result.files && response.result.files.length > 0) {
        const id = response.result.files[0].id;
        localStorage.setItem(SPREADSHEET_ID_KEY, id);
        this.spreadsheetId = id;
        return id;
      }
    } catch (error) {
      console.error('Error searching for settings spreadsheet:', error);
    }

    // Create new spreadsheet
    const createResponse = await gapi.client.sheets.spreadsheets.create({
      resource: {
        properties: {
          title: SETTINGS_SHEET_NAME,
        },
        sheets: [
          {
            properties: {
              title: 'Settings',
            },
          },
        ],
      },
    });

    const id = createResponse.result.spreadsheetId;
    localStorage.setItem(SPREADSHEET_ID_KEY, id);
    this.spreadsheetId = id;

    // Initialize with headers
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: 'Settings!A1:B1',
      valueInputOption: 'RAW',
      resource: {
        values: [['Setting', 'Value']],
      },
    });

    return id;
  }

  /**
   * Get all settings from the Google Sheet
   */
  async getAllSettings(): Promise<Record<string, string>> {
    if (!this.isInitialized) {
      throw new Error('SettingsManager not initialized');
    }

    const spreadsheetId = await this.getOrCreateSpreadsheet();

    try {
      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Settings!A2:B',
      });

      const settings: Record<string, string> = {};

      if (response.result.values) {
        for (const row of response.result.values) {
          if (row.length >= 2 && row[0] && row[1]) {
            settings[row[0]] = row[1];
            // Update cache
            localStorage.setItem(CACHE_PREFIX + row[0], row[1]);
          }
        }
      }

      return settings;
    } catch (error) {
      console.error('Error reading settings from Google Sheet:', error);
      throw error;
    }
  }

  /**
   * Get a specific setting (checks cache first, then Sheet)
   */
  async getSetting(key: string): Promise<string | null> {
    // Check cache first
    const cached = localStorage.getItem(CACHE_PREFIX + key);
    if (cached !== null) {
      return cached;
    }

    // Fetch from Sheet
    if (!this.isInitialized) {
      throw new Error('SettingsManager not initialized');
    }

    const spreadsheetId = await this.getOrCreateSpreadsheet();

    try {
      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Settings!A2:B',
      });

      if (response.result.values) {
        for (const row of response.result.values) {
          if (row.length >= 2 && row[0] === key) {
            const value = row[1];
            // Update cache
            localStorage.setItem(CACHE_PREFIX + key, value);
            return value;
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error reading setting from Google Sheet:', error);
      throw error;
    }
  }

  /**
   * Set a specific setting (updates both cache and Sheet)
   */
  async setSetting(key: string, value: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('SettingsManager not initialized');
    }

    const spreadsheetId = await this.getOrCreateSpreadsheet();

    try {
      // First, check if the key already exists
      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Settings!A2:B',
      });

      let rowIndex = -1;
      if (response.result.values) {
        for (let i = 0; i < response.result.values.length; i++) {
          if (response.result.values[i][0] === key) {
            rowIndex = i + 2; // +2 because we start at row 2 (after header)
            break;
          }
        }
      }

      if (rowIndex > 0) {
        // Update existing row
        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `Settings!A${rowIndex}:B${rowIndex}`,
          valueInputOption: 'RAW',
          resource: {
            values: [[key, value]],
          },
        });
      } else {
        // Append new row
        await gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'Settings!A2:B',
          valueInputOption: 'RAW',
          resource: {
            values: [[key, value]],
          },
        });
      }

      // Update cache
      localStorage.setItem(CACHE_PREFIX + key, value);
    } catch (error) {
      console.error('Error writing setting to Google Sheet:', error);
      throw error;
    }
  }

  /**
   * Clear all cached settings (forces reload from Sheet)
   */
  clearCache(): void {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
  }

  /**
   * Get the Gemini API key
   */
  async getGeminiApiKey(): Promise<string | null> {
    return this.getSetting('gemini_api_key');
  }

  /**
   * Set the Gemini API key
   */
  async setGeminiApiKey(key: string): Promise<void> {
    return this.setSetting('gemini_api_key', key);
  }
}

// Singleton instance
export const settingsManager = new SettingsManager();
