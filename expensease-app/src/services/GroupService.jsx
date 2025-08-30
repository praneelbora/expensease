// src/services/GroupService.js
import { api } from "../utils/api";

const BASE = "/v1/groups";

// --- Groups CRUD & membership ---

export const getAllGroups = () => api.get(`${BASE}/`);

export const getGroupDetails = (groupId) =>
  api.get(`${BASE}/${groupId}`);

export const createGroup = async (name, selectedFriends = []) => {
  if (!String(name || "").trim()) throw new Error("Group name is required");

  const memberIds = selectedFriends
    .filter((f) => f && f._id && f._id !== "me")
    .map((f) => f._id);

  return api.post(`${BASE}/`, { name, memberIds });
};

export const deleteGroup = (groupId) =>
  api.del(`${BASE}/${groupId}`);

export const joinGroup = (code) =>
  api.post(`${BASE}/join`, { code });

export const leaveGroup = (groupId) =>
  api.post(`${BASE}/${groupId}/leave`, {});

// --- Group settings ---

export const updateGroupName = (groupId, name) =>
  api.put(`${BASE}/${groupId}/name`, { name });

export const updateGroupPrivacySetting = (groupId, enforcePrivacy) =>
  api.put(`${BASE}/${groupId}/privacy`, { enforcePrivacy });

// --- Member management ---

export const removeMember = (groupId, memberId) =>
  api.post(`${BASE}/${groupId}/remove`, { memberId });

export const promoteMember = (groupId, memberId) =>
  api.post(`${BASE}/${groupId}/promote`, { memberId });

export const demoteMember = (groupId, memberId) =>
  api.post(`${BASE}/${groupId}/demote`, { memberId });

// --- Group expenses ---

export const getGroupExpenses = (groupId) =>
  api.get(`/v1/expenses/group/${groupId}`);
