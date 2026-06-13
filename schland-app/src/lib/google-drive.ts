import { createSign } from "node:crypto";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  size: number;
  webViewLink: string;
  webContentLink: string;
  iconLink: string;
  thumbnailLink: string;
  modifiedTime: string;
  createdTime: string;
  trashed: boolean;
};

export type DriveConfig = {
  clientEmail: string;
  privateKey: string;
  rootFolderId: string;
  templateId: string;
};

const tokenUrl = "https://oauth2.googleapis.com/token";
const driveApiBaseUrl = "https://www.googleapis.com/drive/v3";
const driveUploadBaseUrl = "https://www.googleapis.com/upload/drive/v3";
const driveScope = "https://www.googleapis.com/auth/drive";
const defaultDriveRootFolderId = "1FPOUB-Uj_mX5X26asct7KS06Ulwj5V4Z";
const defaultDocsTemplateId = "1xRbjl9ue0Ve6s4WYX_pJ81BMvmXAuEiP";
const fileFields =
  "id,name,mimeType,parents,size,webViewLink,webContentLink,iconLink,thumbnailLink,modifiedTime,createdTime,trashed";

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

export function getGoogleDriveConfig(): DriveConfig {
  const clientEmail =
    process.env.GOOGLE_DRIVE_CLIENT_EMAIL ??
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ??
    "";
  const privateKey = normalizePrivateKey(
    process.env.GOOGLE_DRIVE_PRIVATE_KEY ??
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ??
      "",
  );
  const rootFolderId =
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? defaultDriveRootFolderId;
  const templateId =
    process.env.GOOGLE_DOCS_TEMPLATE_ID ??
    process.env.GOOGLE_DRIVE_DOCS_TEMPLATE_ID ??
    defaultDocsTemplateId;

  if (!clientEmail || !privateKey) {
    throw new Error("google_drive_not_configured");
  }

  return {
    clientEmail,
    privateKey,
    rootFolderId,
    templateId,
  };
}

export function hasGoogleDriveServerConfig() {
  return Boolean(
    (process.env.GOOGLE_DRIVE_CLIENT_EMAIL ??
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) &&
      (process.env.GOOGLE_DRIVE_PRIVATE_KEY ??
        process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
  );
}

export function getGoogleDriveRootFolderId() {
  return process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? defaultDriveRootFolderId;
}

export function getGoogleDocsTemplateId() {
  return (
    process.env.GOOGLE_DOCS_TEMPLATE_ID ??
    process.env.GOOGLE_DRIVE_DOCS_TEMPLATE_ID ??
    defaultDocsTemplateId
  );
}

export function isGoogleDocsMimeType(mimeType: string) {
  return mimeType === "application/vnd.google-apps.document";
}

export function isGoogleFolderMimeType(mimeType: string) {
  return mimeType === "application/vnd.google-apps.folder";
}

export function getDrivePreviewLink(fileId: string, mimeType: string) {
  if (isGoogleDocsMimeType(mimeType)) {
    return `https://docs.google.com/document/d/${encodeURIComponent(fileId)}/preview`;
  }

  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
}

export function getDriveWebViewLink(fileId: string, mimeType: string) {
  if (isGoogleDocsMimeType(mimeType)) {
    return `https://docs.google.com/document/d/${encodeURIComponent(fileId)}/edit`;
  }

  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

export class GoogleDriveClient {
  constructor(private readonly config = getGoogleDriveConfig()) {}

  async getFile(fileId: string) {
    return this.request<DriveFile>(
      `/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fileFields)}&supportsAllDrives=true`,
    );
  }

  async listChildren(parentId: string, pageToken?: string) {
    const params = new URLSearchParams({
      corpora: "allDrives",
      fields: `nextPageToken,files(${fileFields})`,
      includeItemsFromAllDrives: "true",
      pageSize: "1000",
      q: `'${parentId.replaceAll("'", "\\'")}' in parents and trashed = false`,
      spaces: "drive",
      supportsAllDrives: "true",
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const response = await this.request<{ files?: DriveFile[]; nextPageToken?: string }>(
      `/files?${params.toString()}`,
    );

    return {
      files: response.files ?? [],
      nextPageToken: response.nextPageToken,
    };
  }

  async listTree(rootFolderId = this.config.rootFolderId) {
    const folders = new Map<string, DriveFile>();
    const files = new Map<string, DriveFile>();
    const queue = [rootFolderId];

    while (queue.length > 0) {
      const parentId = queue.shift();

      if (!parentId) {
        continue;
      }

      let pageToken: string | undefined;

      do {
        const page = await this.listChildren(parentId, pageToken);

        for (const item of page.files) {
          if (isGoogleFolderMimeType(item.mimeType)) {
            folders.set(item.id, item);
            queue.push(item.id);
          } else {
            files.set(item.id, item);
          }
        }

        pageToken = page.nextPageToken;
      } while (pageToken);
    }

    return {
      files: [...files.values()],
      folders: [...folders.values()],
    };
  }

  async createFolder(input: { name: string; parentId: string }) {
    return this.request<DriveFile>("/files?fields=" + encodeURIComponent(fileFields), {
      body: JSON.stringify({
        mimeType: "application/vnd.google-apps.folder",
        name: input.name,
        parents: [input.parentId],
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
  }

  async uploadFile(input: {
    body: Uint8Array;
    mimeType: string;
    name: string;
    parentId: string;
  }) {
    const boundary = `schland_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const metadata = {
      name: input.name,
      parents: [input.parentId],
    };
    const chunks = [
      Buffer.from(
        `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
          metadata,
        )}\r\n`,
      ),
      Buffer.from(
        `--${boundary}\r\ncontent-type: ${input.mimeType || "application/octet-stream"}\r\n\r\n`,
      ),
      Buffer.from(input.body),
      Buffer.from(`\r\n--${boundary}--`),
    ];

    return this.request<DriveFile>(
      `/files?uploadType=multipart&fields=${encodeURIComponent(fileFields)}&supportsAllDrives=true`,
      {
        body: Buffer.concat(chunks),
        headers: {
          "content-type": `multipart/related; boundary=${boundary}`,
        },
        method: "POST",
      },
      driveUploadBaseUrl,
    );
  }

  async copyTemplateToGoogleDoc(input: { name: string; parentId: string }) {
    try {
      return await this.copyFile({
        mimeType: "application/vnd.google-apps.document",
        name: input.name,
        parentId: input.parentId,
        sourceFileId: this.config.templateId,
      });
    } catch (error) {
      if (!isDriveError(error)) {
        throw error;
      }

      return this.copyFile({
        name: input.name,
        parentId: input.parentId,
        sourceFileId: this.config.templateId,
      });
    }
  }

  async copyFile(input: {
    mimeType?: string;
    name: string;
    parentId: string;
    sourceFileId: string;
  }) {
    return this.request<DriveFile>(
      `/files/${encodeURIComponent(
        input.sourceFileId,
      )}/copy?fields=${encodeURIComponent(fileFields)}&supportsAllDrives=true`,
      {
        body: JSON.stringify({
          mimeType: input.mimeType,
          name: input.name,
          parents: [input.parentId],
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
  }

  async moveFile(input: {
    fileId: string;
    previousParents: string[];
    targetParentId: string;
  }) {
    const params = new URLSearchParams({
      addParents: input.targetParentId,
      fields: fileFields,
      supportsAllDrives: "true",
    });
    const removableParents = input.previousParents
      .filter((parent) => parent && parent !== input.targetParentId)
      .join(",");

    if (removableParents) {
      params.set("removeParents", removableParents);
    }

    return this.request<DriveFile>(
      `/files/${encodeURIComponent(input.fileId)}?${params.toString()}`,
      {
        method: "PATCH",
      },
    );
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    baseUrl = driveApiBaseUrl,
  ): Promise<T> {
    const token = await getAccessToken(this.config);
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new DriveApiError(response.status, message);
    }

    return (await response.json()) as T;
  }
}

export class DriveApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(`google_drive_${status}: ${message}`);
  }
}

function isDriveError(error: unknown): error is DriveApiError {
  return error instanceof DriveApiError;
}

async function getAccessToken(config: DriveConfig) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const assertion = signJwt(
    {
      alg: "RS256",
      typ: "JWT",
    },
    {
      aud: tokenUrl,
      exp: nowSeconds + 3600,
      iat: nowSeconds,
      iss: config.clientEmail,
      scope: driveScope,
    },
    config.privateKey,
  );
  const response = await fetch(tokenUrl, {
    body: new URLSearchParams({
      assertion,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    }),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new DriveApiError(response.status, await response.text());
  }

  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!json.access_token) {
    throw new Error("google_drive_token_missing");
  }

  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000,
  };

  return cachedToken.accessToken;
}

function signJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKey: string,
) {
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign("RSA-SHA256");

  signer.update(signingInput);
  signer.end();

  return `${signingInput}.${base64url(signer.sign(privateKey))}`;
}

function base64url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function normalizePrivateKey(value: string) {
  return value.replaceAll("\\n", "\n").trim();
}
