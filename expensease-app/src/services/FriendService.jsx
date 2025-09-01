// src/services/FriendService.js
import { api } from "../utils/api";

const BASE = "/v1/friends";

// List all friends
export const getFriends = () => api.get(`${BASE}/`);

// Send a friend request by email
export const sendFriendRequest = (email) =>
    api.post(`${BASE}/request`, { email });

// Accept an incoming friend request
export const acceptFriendRequest = (requestId) =>
    api.post(`${BASE}/accept`, { requestId });

// Reject an incoming friend request
export const rejectFriendRequest = (requestId) =>
    api.post(`${BASE}/reject`, { requestId });

// Accept/link a friend request via link/share flow
export const acceptLinkFriendRequest = (toId) =>
    api.post(`${BASE}/request-link`, { toId });

// Cancel an outgoing friend request
export const cancelFriendRequest = (requestId) =>
    api.post(`${BASE}/cancel`, { requestId });

// Requests you sent
export const fetchSentRequests = () =>
    api.get(`${BASE}/sent`);

// Requests you received
export const fetchReceivedRequests = () =>
    api.get(`${BASE}/received`);

// Get a single friend's details
export const getFriendDetails = (friendId) =>
    api.get(`${BASE}/${friendId}`);

// Remove an existing friend
export const removeFriend = (friendId) =>
    api.post(`${BASE}/remove`, { friendId });
