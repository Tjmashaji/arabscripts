// حالة ربط القناة ورفع المقاطع. رمز التحديث مشفر دائمًا، ولا يصل للمتصفح.
import { randomUUID } from "node:crypto";
import { decrypt, encrypt } from "../crypto";
import { now, q } from "../db";
import { env } from "../env";
import { errors } from "../http/errors";
import { accessToken, revoke, type GoogleClient } from "../youtube/oauth";

export function googleClient(): GoogleClient {
  const e = env();
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) throw errors.unavailable("ربط يوتيوب غير مُعدّ على الخادم (GOOGLE_CLIENT_ID وGOOGLE_CLIENT_SECRET).");
  return { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET, redirectUri: new URL("/api/youtube/callback", e.APP_URL).toString() };
}

type ChannelRow = { user_id: string; channel_id: string; title: string; thumbnail: string | null; refresh_token_enc: string; scopes: string; connected_at: number };

export function getChannel(userId: string) {
  const c = q.get<ChannelRow>("SELECT * FROM channels WHERE user_id = ?", userId);
  return c ? { channelId: c.channel_id, title: c.title, thumbnail: c.thumbnail, connectedAt: c.connected_at } : null;
}

export function saveChannel(userId: string, ch: { id: string; title: string; thumbnail: string | null }, refreshToken: string, scopes: string) {
  q.run(
    "INSERT INTO channels (user_id, channel_id, title, thumbnail, refresh_token_enc, scopes, connected_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET channel_id = excluded.channel_id, title = excluded.title, thumbnail = excluded.thumbnail, refresh_token_enc = excluded.refresh_token_enc, scopes = excluded.scopes, connected_at = excluded.connected_at",
    userId, ch.id, ch.title, ch.thumbnail, encrypt(refreshToken), scopes, now(),
  );
}

export async function disconnect(userId: string) {
  const c = q.get<ChannelRow>("SELECT * FROM channels WHERE user_id = ?", userId);
  if (!c) return;
  await revoke(decrypt(c.refresh_token_enc));
  q.run("DELETE FROM channels WHERE user_id = ?", userId);
}

// رمز وصول قصير العمر للعامل
export async function channelToken(userId: string) {
  const c = q.get<ChannelRow>("SELECT * FROM channels WHERE user_id = ?", userId);
  if (!c) return null;
  return accessToken(googleClient(), decrypt(c.refresh_token_enc));
}

export type UploadRow = { id: string; project_id: string; render_id: string; job_id: string; status: string; privacy: string; publish_at: number | null; session_url: string | null; video_id: string | null; created_at: number };

export function createUpload(projectId: string, renderId: string, jobId: string, privacy: string, publishAt: number | null) {
  const existing = q.get<UploadRow>("SELECT * FROM uploads WHERE job_id = ?", jobId);
  if (existing) return existing;
  const id = randomUUID();
  q.run("INSERT INTO uploads (id, project_id, render_id, job_id, status, privacy, publish_at, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)", id, projectId, renderId, jobId, privacy, publishAt, now());
  return q.get<UploadRow>("SELECT * FROM uploads WHERE id = ?", id)!;
}

export function projectUploads(projectId: string) {
  return q.all<UploadRow>("SELECT * FROM uploads WHERE project_id = ? ORDER BY created_at DESC LIMIT 20", projectId).map((u) => ({
    id: u.id, status: u.status, privacy: u.privacy, publishAt: u.publish_at, videoId: u.video_id, createdAt: u.created_at,
    url: u.video_id ? `https://youtube.com/shorts/${u.video_id}` : null,
  }));
}
