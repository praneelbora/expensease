const express = require('express');
const router = express.Router();
const Group = require('../../models/Group');
const User = require('../../models/User');
const auth = require('../../middleware/auth');

// ✅ CREATE GROUP
router.post('/', auth, async (req, res) => {
  const { name, memberIds } = req.body;
  try {
    const group = new Group({
      name,
      members: [...memberIds, req.user.id], // Include the creator
      createdBy: req.user.id
    });

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

module.exports = router;
