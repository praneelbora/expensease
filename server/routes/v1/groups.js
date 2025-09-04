const express = require('express');
const router = express.Router();
const Group = require('../../models/Group');
const User = require('../../models/User');
const Expense = require('../../models/Expense');
const auth = require('../../middleware/auth');

function generateGroupCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// ✅ CREATE GROUP
router.post('/', auth, async (req, res) => {
    const { name, memberIds } = req.body;
    try {

        let group = new Group({
            name,
            members: [...memberIds, req.user.id], // Include the creator
            createdBy: req.user.id
        });
        let code;
        let existing;

        // Ensure unique code
        do {
            code = generateGroupCode();
            existing = await Group.findOne({ code });
        } while (existing);
        group.code = code;
        await group.save();
        res.status(201).json(group);
    } catch (error) {
        console.log('groups/ error: ', error);
        res.status(400).json({ error: error.message });
    }
});

// ✅ GET GROUP BY ID
router.get('/:groupId', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId)
            .populate('members', 'name email') // Only get name & email
            .populate('createdBy', 'name email');

        if (!group) return res.status(404).json({ error: 'Group not found' });

        res.json(group);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/', auth, async (req, res) => {
    try {
        const groups = await Group.find({ members: req.user.id })
            .populate('members', 'name email')
            .populate('createdBy', 'name email');

        res.json(groups);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ✅ ADD MEMBER TO GROUP
router.put('/:groupId/add', auth, async (req, res) => {
    const { memberId } = req.body;

    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ error: 'Group not found' });

        if (!group.members.includes(memberId)) {
            group.members.push(memberId);
            await group.save();
        }

        res.json(group);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ✅ REMOVE MEMBER FROM GROUP
router.put('/:groupId/remove', auth, async (req, res) => {
    const { memberId } = req.body;

    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ error: 'Group not found' });

        group.members = group.members.filter(id => id.toString() !== memberId);
        await group.save();

        res.json(group);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post("/join", auth, async (req, res) => {
    const { code } = req.body;
    const group = await Group.findOne({ code });

    if (!group) {
        return res.status(404).json({ message: "Group not found" });
    }

    if (group.members.includes(req.user.id)) {
        return res.status(400).json({ message: "Already a member" });
    }

    group.members.push(req.user.id);
    await group.save();
    res.json(group);
});

// ✅ UPDATE GROUP PRIVACY SETTING (Admin-only)
router.put('/:groupId/privacy', auth, async (req, res) => {
    const { enforcePrivacy } = req.body;

    try {
        const group = await Group.findById(req.params.groupId);

        if (!group) return res.status(404).json({ message: 'Group not found' });

        // Only allow if requester is group creator
        if (group.createdBy.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Only group admin can change privacy settings' });
        }

        group.settings.enforcePrivacy = enforcePrivacy;
        await group.save();

        res.json({ message: 'Privacy setting updated', enforcePrivacy });
    } catch (err) {
        console.error("Error updating privacy setting:", err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.delete("/:groupId", auth, async (req, res) => {
    try {
        const { groupId } = req.params;

        const group = await Group.findById(groupId);
        if (!group) {
            return res.status(404).json({ message: "Group not found" });
        }

        // Only creator can delete (or adjust logic if members can too)
        if (group.createdBy.toString() !== req.user.id) {
            return res.status(403).json({ message: "Not authorized to delete this group" });
        }

        // Delete all related expenses
        await Expense.deleteMany({ groupId });

        // Delete the group
        await Group.findByIdAndDelete(groupId);

        return res.json({ message: "Group and related expenses deleted successfully" });
    } catch (err) {
        console.error("Error deleting group:", err);
        return res.status(500).json({ message: "Server error" });
    }
});

router.post('/:groupId/addMembers', auth, async (req, res) => {
    const { members } = req.body; // array of userIds

    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ error: 'Group not found' });

        let added = [];
        for (const memberId of members || []) {
            if (!group.members.includes(memberId)) {
                group.members.push(memberId);
                added.push(memberId);
            }
        }

        await group.save();
        const populated = await Group.findById(group._id)
            .populate("members", "name email")
            .populate("createdBy", "name email");

        res.json({ group: populated, added });
    } catch (error) {
        console.error("addMembers error:", error);
        res.status(400).json({ error: error.message });
    }
});
module.exports = router;
