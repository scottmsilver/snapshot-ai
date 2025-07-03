import type { Shape } from '@/types/drawing';

declare const gapi: any;

interface ProjectMetadata {
  createdAt: string;
  updatedAt: string;
  author: string;
  version: string;
}

export interface ProjectData {
  version: string;
  image?: { // Optional for backwards compatibility checking
    data: string;
    name: string;
    width: number;
    height: number;
  };
  shapes: Shape[];
  metadata: ProjectMetadata;
  canvas?: { // Canvas dimensions
    width: number;
    height: number;
  };
}

export interface ProjectFile {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime: string;
  thumbnailLink?: string;
  webViewLink?: string;
}

export interface ShareOptions {
  type: 'anyone' | 'user' | 'group' | 'domain';
  role: 'reader' | 'writer';
  emailAddress?: string;
}

export interface ShareResult {
  shareLink?: string;
  permissionId?: string;
}

class GoogleDriveService {
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  async initialize(accessToken: string): Promise<void> {
    if (this.isInitialized) return;
    
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      // Check if gapi is already loaded
      if (window.gapi) {
        gapi.load('client:auth2', async () => {
          try {
            await gapi.client.init({
              apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
              discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
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
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        gapi.load('client:auth2', async () => {
          try {
            await gapi.client.init({
              apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
              discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
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
      script.onerror = reject;
      document.body.appendChild(script);
    });

    return this.initPromise;
  }

  async saveProject(data: ProjectData, fileId?: string): Promise<{ fileId: string }> {
    try {
      const fileContent = JSON.stringify(data, null, 2);
      const file = new Blob([fileContent], { type: 'application/json' });
      
      const metadata = {
        name: `Markup - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
        mimeType: 'application/json'
      };

      // For creating a new file
      if (!fileId) {
        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', file);

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${gapi.auth.getToken().access_token}`
          },
          body: formData
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to save: ${errorText}`);
        }

        const result = await response.json();
        return { fileId: result.id };
      } else {
        // For updating an existing file
        const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${gapi.auth.getToken().access_token}`,
            'Content-Type': 'application/json'
          },
          body: fileContent
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to update: ${errorText}`);
        }

        return { fileId };
      }
    } catch (error) {
      console.error('[GoogleDrive] Save error:', error);
      throw error;
    }
  }

  async loadProject(fileId: string): Promise<ProjectData> {
    try {
      const response = await gapi.client.drive.files.get({
        fileId: fileId,
        alt: 'media',
      });
      
      // The response.result might be a string that needs to be parsed
      const data = typeof response.result === 'string' 
        ? JSON.parse(response.result) 
        : response.result;
      
      return data as ProjectData;
    } catch (error) {
      console.error('Error loading project:', error);
      throw error;
    }
  }

  async listProjects(): Promise<ProjectFile[]> {
    const response = await gapi.client.drive.files.list({
      q: "mimeType='application/json' and name contains 'Markup'",
      fields: 'files(id, name, createdTime, modifiedTime, thumbnailLink, webViewLink)',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
    });

    return response.result.files || [];
  }

  async shareProject(fileId: string, options: ShareOptions): Promise<ShareResult> {
    const permission: any = {
      type: options.type,
      role: options.role,
    };

    if (options.emailAddress) {
      permission.emailAddress = options.emailAddress;
    }

    const response = await gapi.client.drive.permissions.create({
      fileId: fileId,
      resource: permission,
    });

    // Get shareable link
    const fileResponse = await gapi.client.drive.files.get({
      fileId: fileId,
      fields: 'webViewLink',
    });

    return {
      shareLink: fileResponse.result.webViewLink,
      permissionId: response.result.id,
    };
  }

  async deleteProject(fileId: string): Promise<void> {
    await gapi.client.drive.files.delete({
      fileId: fileId,
    });
  }

  async createShareableLink(fileId: string): Promise<string> {
    // Make file accessible to anyone with the link
    await this.shareProject(fileId, {
      type: 'anyone',
      role: 'reader',
    });

    const response = await gapi.client.drive.files.get({
      fileId: fileId,
      fields: 'webViewLink',
    });

    return response.result.webViewLink;
  }
}

export const googleDriveService = new GoogleDriveService();