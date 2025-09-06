// utils/pushToken.js
import Admin from "../../models/Admin.js";
import User from "../../models/User.js";

export async function savePushToken({ userId, token, platform }) {
    
    if (!token || !["ios", "android"].includes(platform)) {
        throw new Error("Valid token and platform are required");
    }

    // --- Save to User if provided ---
    if (userId) {
        // remove old duplicate (in case same token added twice)
        await User.findByIdAndUpdate(
            userId,
            { $pull: { [`pushTokens.${platform}`]: token } }
        );
        await User.findByIdAndUpdate(
            userId,
            { $addToSet: { [`pushTokens.${platform}`]: token } },
            { new: true }
        );
    }

    // --- Ensure Admin also has it ---
    await Admin.findOneAndUpdate(
        {},
        { $addToSet: { [`pushTokens.${platform}`]: token } },
        { upsert: true, new: true }
    );
}

export async function savePushTokenPublic(req, res) {
    try {
        const { token, platform } = req.body;

        await savePushToken({ token, platform }); // no userId
        res.json({ success: true, target: "admin" });
    } catch (err) {
        console.error("Save public push token error:", err);
        res.status(500).json({ error: "Failed to save push token" });
    }
}

export async function savePushTokenAuthed(req, res) {
    try {
        const { token, platform } = req.body;
        const userId = req.user?.id;

        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        await savePushToken({ userId, token, platform });

        res.json({ success: true, target: "user+admin" });
    } catch (err) {
        console.error("Save authed push token error:", err);
        res.status(500).json({ error: "Failed to save push token" });
    }
}