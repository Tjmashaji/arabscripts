"use client";
// عمليات المشاهد المشتركة بين صفحات السيناريو والإنتاج والمونتاج، مع تحديث فوري للحالة المحلية
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import { useProject, type Scene } from "./project-context";

export function useScenes() {
  const { data, setData, reload } = useProject();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const pid = data?.project.id;

  const replace = (scene: Scene) => data && setData({ ...data, scenes: data.scenes.map((s) => (s.id === scene.id ? scene : s)) });

  async function patch(scene: Scene, changes: Partial<Scene>) {
    setSaving(scene.id);
    setError(null);
    try {
      const r = await api<{ scene: Scene }>(`/api/projects/${pid}/scenes/${scene.id}`, { method: "PATCH", body: { ...changes, version: scene.version } });
      replace(r.scene);
      return r.scene;
    } catch (e) {
      setError((e as ApiError).message);
      if ((e as ApiError).code === "conflict") await reload();
    } finally {
      setSaving(null);
    }
  }
  async function reorder(ids: string[]) {
    if (!data) return;
    const byId = new Map(data.scenes.map((s) => [s.id, s]));
    setData({ ...data, scenes: ids.map((id, i) => ({ ...byId.get(id)!, position: i })) });
    try {
      const r = await api<{ scenes: Scene[] }>(`/api/projects/${pid}/scenes`, { method: "PATCH", body: { order: ids } });
      setData({ ...data, scenes: r.scenes });
    } catch (e) {
      setError((e as ApiError).message);
      await reload();
    }
  }
  async function add(after: number | null) {
    try {
      await api(`/api/projects/${pid}/scenes`, { body: { after_position: after } });
      await reload();
    } catch (e) {
      setError((e as ApiError).message);
    }
  }
  async function duplicate(id: string) {
    await api(`/api/projects/${pid}/scenes/${id}/duplicate`, { body: {} }).catch((e) => setError((e as ApiError).message));
    await reload();
  }
  async function remove(id: string) {
    if (!confirm("حذف هذا المشهد؟")) return;
    await api(`/api/projects/${pid}/scenes/${id}`, { method: "DELETE" }).catch((e) => setError((e as ApiError).message));
    await reload();
  }
  return { patch, reorder, add, duplicate, remove, error, setError, saving };
}
