
// groupService.js

const BASE_URL = import.meta.env.VITE_BACKEND_URL;

export const getAllGroups = async (userToken) => {
    const response = await fetch(`${BASE_URL}/v1/groups/`, {
        headers: {
            "Content-Type": "application/json",
            "x-auth-token": userToken,
        },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to get all group");
    return data;
};

export const getGroupDetails = async (groupId, userToken) => {
    const response = await fetch(`${BASE_URL}/v1/groups/${groupId}`, {
        headers: {
            "Content-Type": "application/json",
            "x-auth-token": userToken,
        },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to get group details");
    return data;
};

export const updateGroupName = async (groupId, name, userToken) => {
    const response = await fetch(`${BASE_URL}/v1/groups/${groupId}/name`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "x-auth-token": userToken,
        },
        body: JSON.stringify({ name }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to update group name");
    return data;
};

export const joinGroup = async (code, userToken) => {
    const response = await fetch(`${BASE_URL}/v1/groups/join`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-auth-token": userToken,
        },
        body: JSON.stringify({ code }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to join group");
    return data;
};

export const leaveGroup = async (groupId, userToken) => {
    const response = await fetch(`${BASE_URL}/v1/groups/${groupId}/leave`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-auth-token": userToken,
        },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to leave group");
    return data;
};

export const deleteGroup = async (groupId, userToken) => {
    const response = await fetch(`${BASE_URL}/v1/groups/${groupId}`, {
        method: "DELETE",
        headers: {
            "Content-Type": "application/json",
            "x-auth-token": userToken,
        },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to delete group");
    return data;
};

export const removeMember = async (groupId, memberId, userToken) => {
    const response = await fetch(`${BASE_URL}/v1/groups/${groupId}/remove`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-auth-token": userToken,
        },
        body: JSON.stringify({ memberId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to remove member");
    return data;
};

export const promoteMember = async (groupId, memberId, userToken) => {
    const response = await fetch(`${BASE_URL}/v1/groups/${groupId}/promote`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-auth-token": userToken,
        },
        body: JSON.stringify({ memberId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to promote member");
    return data;
};

export const demoteMember = async (groupId, memberId, userToken) => {
    const response = await fetch(`${BASE_URL}/v1/groups/${groupId}/demote`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-auth-token": userToken,
        },
        body: JSON.stringify({ memberId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to demote member");
    return data;
};

export const getGroupExpenses = async (groupId, userToken) => {
    const response = await fetch(`${BASE_URL}/v1/expenses/group/${groupId}`, {
        headers: {
            "Content-Type": "application/json",
            "x-auth-token": userToken,
        },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to fetch group expenses");
    return data;
};

export const createGroup = async (name, selectedFriends, userToken) => {
    if (!name.trim()) throw new Error("Group name is required");

    const memberIds = selectedFriends
        .filter(friend => friend._id !== 'me')
        .map(friend => friend._id);

    try {
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/groups/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-auth-token": userToken,
            },
            body: JSON.stringify({ name, memberIds }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Failed to create group");
        }

        return data; // Includes `code`, `groupId`, etc.
    } catch (error) {
        console.error("createGroup error:", error.message);
        throw error;
    }
};

export const updateGroupPrivacySetting = async (groupId, enforcePrivacy, userToken) => {
    const response = await fetch(`${BASE_URL}/v1/groups/${groupId}/privacy`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "x-auth-token": userToken,
        },
        body: JSON.stringify({ enforcePrivacy }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to update privacy setting");
    return data;
};

