const BASE_URL = import.meta.env.VITE_BACKEND_URL;

export const getFriends = async (userToken) => {
    const response = await fetch(`${BASE_URL}/v1/friends/`, {
        headers: {
            "Content-Type": "application/json",
            'x-auth-token': userToken
        },
    });
    if (!response.ok) throw new Error(data.message || "Failed to get friends");
    const data = await response.json();
    return data;
};

export const sendFriendRequest = async (email, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/friends/request`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-auth-token': userToken,
        },
        body: JSON.stringify({ email }),
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to send friend request");
    }

    return data;
};

export const acceptFriendRequest = async (requestId, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/friends/accept`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-auth-token': userToken,
        },
        body: JSON.stringify({ requestId }),
    });

    if (!res.ok) throw new Error("Failed to accept friend request");
    return await res.json();
};

export const rejectFriendRequest = async (requestId, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/friends/reject`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-auth-token': userToken,
        },
        body: JSON.stringify({ requestId }),
    });

    if (!res.ok) throw new Error("Failed to reject friend request");
    return await res.json();
};

export const acceptLinkFriendRequest = async (toId, userToken) => {
    const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/friends/request-link`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-auth-token': userToken,
        },
        body: JSON.stringify({ toId }),
    });

    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to send friend request.");
    }

    return await res.json();
};

export const cancelFriendRequest = async (requestId, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/friends/cancel`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-auth-token': userToken,
        },
        body: JSON.stringify({ requestId }),
    });

    if (!res.ok) throw new Error("Failed to cancel friend request");
    return await res.json();
};

export const fetchSentRequests = async (userToken) => {
    const res = await fetch(`${BASE_URL}/v1/friends/sent`, {
        headers: {
            'Content-Type': 'application/json',
            'x-auth-token': userToken,
        },
    });

    if (!res.ok) throw new Error("Failed to fetch sent requests");
    return await res.json();
};

export const fetchReceivedRequests = async (userToken) => {
    const res = await fetch(`${BASE_URL}/v1/friends/received`, {
        headers: {
            'Content-Type': 'application/json',
            'x-auth-token': userToken,
        },
    });

    if (!res.ok) throw new Error("Failed to fetch received requests");
    return await res.json();
};

export const getFriendDetails = async (friendId, userToken) => {
    const response = await fetch(`${BASE_URL}/v1/friends/${friendId}`, {
        headers: {
            "Content-Type": "application/json",
            "x-auth-token": userToken,
        },
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to get friend details");
    return data;
};

export const removeFriend = async (friendId, userToken) => {
    const res = await fetch(`${BASE_URL}/v1/friends/remove`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-auth-token': userToken,
        },
        body: JSON.stringify({ friendId }),
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to remove friend");
    }

    return data;
};