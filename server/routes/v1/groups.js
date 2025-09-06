// routes/groups.js  (updated with notification category + opts)
const express = require('express');
const router = express.Router();
const Group = require('../../models/Group');
const User = require('../../models/User');
const Expense = require('../../models/Expense');
const auth = require('../../middleware/auth');
const notif = require('./notifs'); // adjust path if your helper is elsewhere

function generateGroupCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// helper: get member ids as strings
const groupMemberIds = async (groupId) => {
  if (!groupId) return [];
  const g = await Group.findById(groupId).select('members').lean();
  if (!g || !Array.isArray(g.members)) return [];
  return g.members.map(m => String(m));
};

// small helper to fetch display name
const getUserName = async (userId) => {
  try {
    const u = await User.findById(userId).select('name').lean();
    return u?.name || 'Someone';
  } catch {
    return 'Someone';
  }
};

// ----------------- ROUTES -----------------

// ✅ CREATE GROUP
router.post('/', auth, async (req, res) => {
    const { name, memberIds = [] } = req.body;
    try {
        let group = new Group({
            name,
            members: [...new Set([...memberIds.map(String), String(req.user.id)])], // Include creator and dedupe
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

        const populated = await Group.findById(group._id).populate('members', 'name email').populate('createdBy', 'name email');

        // Notify invited members (except actor) that they've been added to a group
        (async () => {
          try {
            const actorName = await getUserName(req.user.id);
            const invited = (memberIds || []).map(String).filter(id => id !== String(req.user.id));
            if (invited.length) {
              const title = 'Added to group';
              const body = `${actorName} added you to group "${populated.name}"`;
              const data = { type: 'group_added', groupId: String(populated._id), groupName: populated.name };
              const category = 'groups';
              const opts = { channel: 'push', fromFriendId: String(req.user.id), groupId: String(populated._id) };
              await notif.sendToUsers(invited, title, body, data, category, opts);
            }
          } catch (e) {
            console.error('Group create notification failed:', e);
          }
        })();

        res.status(201).json(populated);
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

        if (!group.members.map(String).includes(String(memberId))) {
            group.members.push(memberId);
            await group.save();

            // notify the added member (best-effort)
            (async () => {
              try {
                const actorName = await getUserName(req.user.id);
                const memberName = await getUserName(memberId);
                const title = `Added to ${group.name}`;
                const body = `${actorName} added you to group "${group.name}"`;
                const data = { type: 'group_member_added', groupId: String(group._id), groupName: group.name };
                const category = 'groups';
                const opts = { channel: 'push', fromFriendId: String(req.user.id), groupId: String(group._id) };
                await notif.sendToUsers([String(memberId)], title, body, data, category, opts);
              } catch (e) {
                console.error('Add member notification failed:', e);
              }
            })();
        }

        const populated = await Group.findById(group._id).populate('members', 'name email').populate('createdBy', 'name email');
        res.json(populated);
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

        const wasMember = group.members.map(String).includes(String(memberId));
        group.members = group.members.filter(id => id.toString() !== memberId);
        await group.save();

        // Notify the removed member (best-effort)
        if (wasMember) {
          (async () => {
            try {
              const actorName = await getUserName(req.user.id);
              const title = `Removed from ${group.name}`;
              const body = `${actorName} removed you from group "${group.name}"`;
              const data = { type: 'group_member_removed', groupId: String(group._id), groupName: group.name };
              const category = 'groups';
              const opts = { channel: 'push', fromFriendId: String(req.user.id), groupId: String(group._id) };
              await notif.sendToUsers([String(memberId)], title, body, data, category, opts);
            } catch (e) {
              console.error('Remove member notification failed:', e);
            }
          })();
        }

        const populated = await Group.findById(group._id).populate('members', 'name email').populate('createdBy', 'name email');
        res.json(populated);
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

    if (group.members.map(String).includes(String(req.user.id))) {
        return res.status(400).json({ message: "Already a member" });
    }

    group.members.push(req.user.id);
    await group.save();

    // Notify existing group members that someone joined (best-effort)
    (async () => {
      try {
        const actorName = await getUserName(req.user.id);
        const members = await groupMemberIds(group._id);
        // exclude actor
        const recips = members.filter(id => id !== String(req.user.id));
        if (recips.length) {
          const title = `${group.name}: new member`;
          const body = `${actorName} joined the group`;
          const data = { type: 'group_member_joined', groupId: String(group._id), groupName: group.name, userId: String(req.user.id) };
          const category = 'groups';
          const opts = { channel: 'push', fromFriendId: String(req.user.id), groupId: String(group._id) };
          await notif.sendToUsers(recips, title, body, data, category, opts);
        }
      } catch (e) {
        console.error('Join notification failed:', e);
      }
    })();

    const populated = await Group.findById(group._id).populate('members', 'name email').populate('createdBy', 'name email');
    res.json(populated);
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

        group.settings = group.settings || {};
        group.settings.enforcePrivacy = enforcePrivacy;
        await group.save();

        // Notify group members about privacy change (best-effort)
        (async () => {
          try {
            const actorName = await getUserName(req.user.id);
            const members = await groupMemberIds(group._id);
            const recips = members.filter(id => id !== String(req.user.id));
            if (recips.length) {
              const title = `${group.name}: privacy updated`;
              const body = `${actorName} changed group privacy settings`;
              const data = { type: 'group_privacy_changed', groupId: String(group._id), groupName: group.name, enforcePrivacy };
              const category = 'groups';
              const opts = { channel: 'push', fromFriendId: String(req.user.id), groupId: String(group._id) };
              await notif.sendToUsers(recips, title, body, data, category, opts);
            }
          } catch (e) {
            console.error('Privacy change notification failed:', e);
          }
        })();

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

        // gather members before deletion
        const members = await groupMemberIds(groupId);

        // Delete all related expenses
        await Expense.deleteMany({ groupId });

        // Delete the group
        await Group.findByIdAndDelete(groupId);

        // Notify previous members (except actor) that group was deleted
        (async () => {
          try {
            const actorName = await getUserName(req.user.id);
            const recips = members.filter(id => id !== String(req.user.id));
            if (recips.length) {
              const title = `Group "${group.name}" deleted`;
              const body = `${actorName} deleted the group`;
              const data = { type: 'group_deleted', groupId: String(groupId), groupName: group.name };
              const category = 'groups';
              const opts = { channel: 'push', fromFriendId: String(req.user.id), groupId: String(group._id) };
              await notif.sendToUsers(recips, title, body, data, category, opts);
            }
          } catch (e) {
            console.error('Group delete notification failed:', e);
          }
        })();

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
            if (!group.members.map(String).includes(String(memberId))) {
                group.members.push(memberId);
                added.push(String(memberId));
            }
        }

        await group.save();
        const populated = await Group.findById(group._id)
            .populate("members", "name email")
            .populate("createdBy", "name email");

        // notify newly added members (best-effort)
        if (added.length) {
          (async () => {
            try {
              const actorName = await getUserName(req.user.id);
              const title = `Added to ${populated.name}`;
              const body = `${actorName} added you to group "${populated.name}"`;
              const data = { type: 'group_members_added', groupId: String(populated._id), groupName: populated.name, addedCount: added.length };
              const category = 'groups';
              const opts = { channel: 'push', fromFriendId: String(req.user.id), groupId: String(populated._id) };
              await notif.sendToUsers(added, title, body, data, category, opts);
            } catch (e) {
              console.error('addMembers notification failed:', e);
            }
          })();
        }

        res.json({ group: populated, added });
    } catch (error) {
        console.error("addMembers error:", error);
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
