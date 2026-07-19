"use client";

import {
  useEffect,
  useState,
  useCallback,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { API_URL } from "../lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrgNode {
  id: string;
  tenant_id: string;
  name: string;
  org_type: string;
  parent_id: string | null;
  created_at: string;
  children: OrgNode[];
}

interface OrgFlat {
  id: string;
  name: string;
  org_type: string;
  parent_id: string | null;
}

interface Member {
  id: string;
  user_id: string;
  organization_id: string;
  role: string;
  created_at: string;
}

interface TenantUser {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ORG_TYPE_COLORS: Record<string, string> = {
  enterprise: "bg-purple-100 text-purple-700",
  area:       "bg-blue-100 text-blue-700",
  district:   "bg-cyan-100 text-cyan-700",
  center:     "bg-green-100 text-green-700",
};

const ORG_TYPES = ["enterprise", "area", "district", "center"] as const;

const ORG_ROLES = [
  "admin", "safety", "hr", "benefits", "legal",
  "operations", "center_manager", "district_manager", "area_manager",
] as const;

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", safety: "Safety", hr: "HR", benefits: "Benefits",
  legal: "Legal", operations: "Operations", center_manager: "Center Manager",
  district_manager: "District Director", area_manager: "Area VP",
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OrganizationsPage() {
  const { isAuthenticated, isAdmin } = useAuth();
  const router = useRouter();

  const [tree, setTree] = useState<OrgNode[]>([]);
  const [flatOrgs, setFlatOrgs] = useState<OrgFlat[]>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Which node is selected (shows member panel)
  const [selectedOrg, setSelectedOrg] = useState<OrgNode | null>(null);
  // Members for selected org
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Modals
  const [showCreate, setShowCreate] = useState<{ parentId: string | null } | null>(null);
  const [showMove, setShowMove] = useState<OrgNode | null>(null);
  const [showRename, setShowRename] = useState<OrgNode | null>(null);

  useEffect(() => {
    if (!isAuthenticated) router.push("/login?from=/organizations");
  }, [isAuthenticated, router]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [treeRes, flatRes, usersRes] = await Promise.all([
        axios.get<OrgNode[]>(`${API_URL}/organizations`),
        axios.get<OrgFlat[]>(`${API_URL}/organizations/flat`),
        axios.get<TenantUser[]>(`${API_URL}/users`),
      ]);
      setTree(treeRes.data);
      setFlatOrgs(flatRes.data);
      setUsers(usersRes.data);
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed to load");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isAuthenticated) refresh(); }, [isAuthenticated, refresh]);

  async function loadMembers(orgId: string) {
    setLoadingMembers(true);
    try {
      const res = await axios.get<Member[]>(`${API_URL}/organizations/${orgId}/members`);
      setMembers(res.data);
    } catch { setMembers([]); }
    finally { setLoadingMembers(false); }
  }

  function selectOrg(org: OrgNode) {
    setSelectedOrg(org);
    loadMembers(org.id);
  }

  if (!isAuthenticated) return null;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Organization Hierarchy</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage your enterprise structure and scoped access permissions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-lg bg-white">
            Refresh
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowCreate({ parentId: null })}
              className="px-4 py-1.5 text-sm font-medium text-white rounded-lg"
              style={{ backgroundColor: "var(--brand-primary)" }}>
              Add Root Node
            </button>
          )}
        </div>
      </div>

      {error && <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5">{error}</div>}

      {loading ? (
        <div className="text-center py-16 text-sm text-gray-400">Loading hierarchy…</div>
      ) : (
        <div className="flex gap-4" style={{ minHeight: 500 }}>
          {/* Tree */}
          <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-y-auto p-4">
            {tree.length === 0 ? (
              <div className="text-center py-16 text-sm text-gray-400">
                No organizations yet.{isAdmin && <> Click <span className="font-medium">Add Root Node</span> to start.</>}
              </div>
            ) : (
              <ul className="space-y-1">
                {tree.map((node) => (
                  <TreeNode
                    key={node.id}
                    node={node}
                    depth={0}
                    selectedId={selectedOrg?.id ?? null}
                    isAdmin={isAdmin}
                    onSelect={selectOrg}
                    onAddChild={(parentId) => setShowCreate({ parentId })}
                    onMove={setShowMove}
                    onRename={setShowRename}
                    onDelete={async (org) => {
                      if (!confirm(`Delete "${org.name}"? This cannot be undone.`)) return;
                      try {
                        await axios.delete(`${API_URL}/organizations/${org.id}`);
                        if (selectedOrg?.id === org.id) setSelectedOrg(null);
                        refresh();
                      } catch (err: unknown) {
                        setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Delete failed");
                      }
                    }}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Member panel */}
          {selectedOrg && (
            <div className="w-80 flex-shrink-0 bg-white rounded-xl border border-gray-200 overflow-y-auto">
              <MembersPanel
                org={selectedOrg}
                members={members}
                users={users}
                loading={loadingMembers}
                onClose={() => setSelectedOrg(null)}
                onMemberChange={() => loadMembers(selectedOrg.id)}
              />
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="font-medium">Type:</span>
        {ORG_TYPES.map((t) => (
          <span key={t} className={`px-2 py-0.5 rounded text-xs font-medium ${ORG_TYPE_COLORS[t]}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </span>
        ))}
      </div>

      {/* Create modal */}
      {showCreate !== null && (
        <CreateOrgModal
          parentId={showCreate.parentId}
          flatOrgs={flatOrgs}
          onClose={() => setShowCreate(null)}
          onCreated={() => { setShowCreate(null); refresh(); }}
        />
      )}

      {/* Move modal */}
      {showMove && (
        <MoveOrgModal
          org={showMove}
          flatOrgs={flatOrgs.filter((o) => o.id !== showMove.id)}
          onClose={() => setShowMove(null)}
          onMoved={() => { setShowMove(null); refresh(); }}
        />
      )}

      {/* Rename modal */}
      {showRename && (
        <RenameOrgModal
          org={showRename}
          onClose={() => setShowRename(null)}
          onRenamed={() => { setShowRename(null); refresh(); }}
        />
      )}
    </div>
  );
}

// ── Tree node (recursive) ─────────────────────────────────────────────────────

interface TreeNodeProps {
  node: OrgNode;
  depth: number;
  selectedId: string | null;
  isAdmin: boolean;
  onSelect: (org: OrgNode) => void;
  onAddChild: (parentId: string) => void;
  onMove: (org: OrgNode) => void;
  onRename: (org: OrgNode) => void;
  onDelete: (org: OrgNode) => void;
}

function TreeNode({ node, depth, selectedId, isAdmin, onSelect, onAddChild, onMove, onRename, onDelete }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <li>
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer group transition-colors ${isSelected ? "bg-indigo-50 border border-indigo-200" : "hover:bg-gray-50"}`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => onSelect(node)}
      >
        {/* Expand/collapse */}
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded((p) => !p); }}
          className="w-4 h-4 flex-shrink-0 text-gray-400 hover:text-gray-700"
        >
          {hasChildren ? (expanded ? "▾" : "▸") : <span className="inline-block w-4" />}
        </button>

        {/* Type badge */}
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${ORG_TYPE_COLORS[node.org_type] ?? "bg-gray-100 text-gray-600"}`}>
          {node.org_type[0].toUpperCase()}
        </span>

        {/* Name */}
        <span className="text-sm font-medium text-gray-800 flex-1 truncate">{node.name}</span>

        {/* Actions — only visible on hover / when selected */}
        {isAdmin && (
          <span className={`flex items-center gap-1 ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}
                onClick={(e) => e.stopPropagation()}>
            <ActionBtn title="Add child" onClick={() => onAddChild(node.id)}>+</ActionBtn>
            <ActionBtn title="Rename" onClick={() => onRename(node)}>✎</ActionBtn>
            <ActionBtn title="Move" onClick={() => onMove(node)}>⇄</ActionBtn>
            <ActionBtn title="Delete" onClick={() => onDelete(node)} danger>×</ActionBtn>
          </span>
        )}
      </div>

      {hasChildren && expanded && (
        <ul className="mt-0.5 space-y-0.5">
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1}
              selectedId={selectedId} isAdmin={isAdmin}
              onSelect={onSelect} onAddChild={onAddChild}
              onMove={onMove} onRename={onRename} onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function ActionBtn({ children, title, onClick, danger }: {
  children: React.ReactNode; title: string;
  onClick: () => void; danger?: boolean;
}) {
  return (
    <button title={title} onClick={onClick}
      className={`w-5 h-5 flex items-center justify-center rounded text-xs font-bold leading-none transition-colors ${
        danger ? "hover:bg-red-100 hover:text-red-600 text-gray-400" : "hover:bg-gray-200 text-gray-400 hover:text-gray-700"
      }`}>
      {children}
    </button>
  );
}

// ── Members panel ─────────────────────────────────────────────────────────────

function MembersPanel({ org, members, users, loading, onClose, onMemberChange }: {
  org: OrgNode;
  members: Member[];
  users: TenantUser[];
  loading: boolean;
  onClose: () => void;
  onMemberChange: () => void;
}) {
  const [addForm, setAddForm] = useState({ user_id: "", role: "safety" });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const memberUserIds = new Set(members.map((m) => m.user_id));
  const availableUsers = users.filter((u) => !memberUserIds.has(u.id));
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  async function handleAdd(e: FormEvent) {
    e.preventDefault(); setAddError(null);
    if (!addForm.user_id) { setAddError("Select a user"); return; }
    setAdding(true);
    try {
      await axios.post(`${API_URL}/organizations/${org.id}/members`, addForm);
      setAddForm({ user_id: "", role: "safety" });
      onMemberChange();
    } catch (err: unknown) {
      setAddError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed");
    } finally { setAdding(false); }
  }

  async function removeMember(userId: string) {
    setRemovingId(userId);
    try {
      await axios.delete(`${API_URL}/organizations/${org.id}/members/${userId}`);
      onMemberChange();
    } catch { /* ignore */ }
    finally { setRemovingId(null); }
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{org.name}</h2>
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ORG_TYPE_COLORS[org.org_type] ?? "bg-gray-100 text-gray-600"}`}>
            {org.org_type}
          </span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">Members ({members.length})</p>
        {loading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No members yet</p>
        ) : (
          <ul className="space-y-1.5">
            {members.map((m) => {
              const u = userMap[m.user_id];
              return (
                <li key={m.id} className="flex items-center gap-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate">{u?.email ?? m.user_id.slice(0, 8) + "…"}</p>
                    <p className="text-gray-400">{ROLE_LABELS[m.role] ?? m.role}</p>
                  </div>
                  <button onClick={() => removeMember(m.user_id)}
                    disabled={removingId === m.user_id}
                    className="text-red-400 hover:text-red-600 disabled:opacity-50 text-xs">
                    {removingId === m.user_id ? "…" : "✕"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Add member */}
      <form onSubmit={handleAdd} className="border-t border-gray-100 pt-3 space-y-2">
        <p className="text-xs font-medium text-gray-500">Assign user</p>
        <select value={addForm.user_id} onChange={(e) => setAddForm((f) => ({ ...f, user_id: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500">
          <option value="">Select user…</option>
          {availableUsers.map((u) => (
            <option key={u.id} value={u.id}>{u.email}</option>
          ))}
        </select>
        <select value={addForm.role} onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500">
          {ORG_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        {addError && <p className="text-xs text-red-600">{addError}</p>}
        <button type="submit" disabled={adding || !addForm.user_id}
          className="w-full py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-50"
          style={{ backgroundColor: "var(--brand-primary)" }}>
          {adding ? "Assigning…" : "Assign"}
        </button>
      </form>
    </div>
  );
}

// ── Create org modal ──────────────────────────────────────────────────────────

function CreateOrgModal({ parentId, flatOrgs, onClose, onCreated }: {
  parentId: string | null;
  flatOrgs: OrgFlat[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const parentName = parentId ? flatOrgs.find((o) => o.id === parentId)?.name : null;
  const [form, setForm] = useState({ name: "", org_type: "center" as string, parent_id: parentId });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(null); setSaving(true);
    try {
      await axios.post(`${API_URL}/organizations`, form);
      onCreated();
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <Modal title={parentName ? `Add child to "${parentName}"` : "Add root organization"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Name">
          <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className={INPUT} placeholder="e.g. North Region" />
        </Field>
        <Field label="Type">
          <select value={form.org_type} onChange={(e) => setForm((f) => ({ ...f, org_type: e.target.value }))}
            className={INPUT + " bg-white"}>
            {ORG_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </Field>
        <Field label="Parent">
          <select value={form.parent_id ?? ""} onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value || null }))}
            className={INPUT + " bg-white"}>
            <option value="">None (root)</option>
            {flatOrgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.org_type})</option>)}
          </select>
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <ModalActions saving={saving} onClose={onClose} saveLabel="Create" />
      </form>
    </Modal>
  );
}

// ── Move org modal ────────────────────────────────────────────────────────────

function MoveOrgModal({ org, flatOrgs, onClose, onMoved }: {
  org: OrgNode;
  flatOrgs: OrgFlat[];
  onClose: () => void;
  onMoved: () => void;
}) {
  const [parentId, setParentId] = useState<string | null>(org.parent_id);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(null); setSaving(true);
    try {
      await axios.patch(`${API_URL}/organizations/${org.id}/parent`, { parent_id: parentId || null });
      onMoved();
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <Modal title={`Move "${org.name}"`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="New parent">
          <select value={parentId ?? ""} onChange={(e) => setParentId(e.target.value || null)}
            className={INPUT + " bg-white"}>
            <option value="">None (promote to root)</option>
            {flatOrgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.org_type})</option>)}
          </select>
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <ModalActions saving={saving} onClose={onClose} saveLabel="Move" />
      </form>
    </Modal>
  );
}

// ── Rename org modal ──────────────────────────────────────────────────────────

function RenameOrgModal({ org, onClose, onRenamed }: {
  org: OrgNode;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const [name, setName] = useState(org.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(null); setSaving(true);
    try {
      await axios.patch(`${API_URL}/organizations/${org.id}`, { name });
      onRenamed();
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? String(err.response?.data?.detail ?? err.message) : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <Modal title="Rename organization" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)}
            className={INPUT} />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <ModalActions saving={saving} onClose={onClose} saveLabel="Rename" />
      </form>
    </Modal>
  );
}

// ── Shared UI primitives ──────────────────────────────────────────────────────

const INPUT = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function ModalActions({ saving, onClose, saveLabel }: { saving: boolean; onClose: () => void; saveLabel: string }) {
  return (
    <div className="flex gap-2 pt-1">
      <button type="submit" disabled={saving}
        className="flex-1 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
        style={{ backgroundColor: "var(--brand-primary)" }}>
        {saving ? `${saveLabel}…` : saveLabel}
      </button>
      <button type="button" onClick={onClose}
        className="flex-1 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">
        Cancel
      </button>
    </div>
  );
}
