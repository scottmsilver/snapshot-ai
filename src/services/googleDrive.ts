import { Shape } from '@/types/drawing';

declare const gapi: any;

interface ProjectMetadata {
  createdAt: string;
  updatedAt: string;
  author: string;
  version: string;
}

export interface ProjectData {
  version: string;
  image: {
    data: string;
    name: string;
    width: number;
    height: number;
  };
  shapes: Shape[];
  metadata: ProjectMetadata;
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
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        gapi.load('client', async () => {
          try {
            await gapi.client.init({
              apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
              discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
            });
            
            gapi.client.setToken({
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
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const metadata = {
      name: data.metadata.author ? `Markup - ${new Date().toLocaleDateString()}` : 'Untitled Markup',
      mimeType: 'application/json',
      parents: ['root'],
    };

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(data) +
      close_delim;

    const request = gapi.client.request({
      path: fileId ? `/drive/v3/files/${fileId}` : '/drive/v3/files',
      method: fileId ? 'PATCH' : 'POST',
      params: {
        uploadType: 'multipart',
      },
      headers: {
        'Content-Type': 'multipart/related; boundary="' + boundary + '"',
      },
      body: multipartRequestBody,
    });

    const response = await request;
    return { fileId: response.result.id };
  }

  async loadProject(fileId: string): Promise<ProjectData> {
    const response = await gapi.client.drive.files.get({
      fileId: fileId,
      alt: 'media',
    });

    return response.result as ProjectData;
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