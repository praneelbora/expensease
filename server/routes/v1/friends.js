const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const FriendRequest = require('../../models/FriendRequest');
const bcrypt = require('bcryptjs');
const auth = require("../../middleware/auth");
const jwt = require('jsonwebtoken');

router.post('/request', auth, async (req, res) => {
  try {
    const { email } = req.body;
    const senderId = req.user.id;
    
    const receiver = await User.findOne({ email: email });
    if (!receiver) return res.status(404).json({ message: 'User not found' });

    const sender = await User.findById(senderId);
    if (!receiver) return res.status(404).json({ message: 'User not found' });
  
    // Check if already exists
    const existing = await FriendRequest.findOne({
      sender: sender._id, receiver: receiver._id, status: 'pending'
    });
    if (existing) return res.status(400).json({ msg: 'Request already sent' });
    let existing2 = await FriendRequest.findOne({
      sender: receiver._id, receiver: sender._id, status: 'pending'
    });
    if(existing2){
      existing2.status = 'accepted'
      await existing2.save()
      sender.friends.push(receiver._id);
      receiver.friends.push(sender._id);
      await sender.save();
      await receiver.save();
      return res.status(200).json({ msg: 'Friends' });
    }
    const newRequest = new FriendRequest({ sender: sender._id, receiver: receiver._id });
    await newRequest.save();
    res.status(201).json(newRequest);

  } catch (error) {
    console.log('friends/request error: ',error);
        res.status(500).json({ error: error.message });
  }
  
});
router.post('/accept', auth, async (req, res) => {
  try {
    const { requestId } = req.body;
    const request = await FriendRequest.findById(requestId).populate('sender receiver');

    if (!request || request.receiver._id.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    request.status = 'accepted';
    await request.save();

    // Add each other as friends
    let sender = await User.findById(request.sender._id);
    let receiver = await User.findById(request.receiver._id);

    sender.friends.push(receiver._id);
    receiver.friends.push(sender._id);

    await sender.save();
    await receiver.save();

    res.json({ msg: 'Friend request accepted' });
  } catch (error) {
    console.log('friends/accept error: ',error);
    res.status(500).json({ error: error.message });
  }
});
router.post('/reject', auth, async (req, res) => {
  try {
    const { requestId } = req.body;
    const request = await FriendRequest.findById(requestId);

    if (!request || request.receiver.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    request.status = 'rejected';
    await request.save();
    res.json({ msg: 'Friend request rejected' });
  } catch (error) {
    console.log('friends/reject error: ',error);
    res.status(500).json({ error: error.message });
  }
  
});

router.get('/sent', auth, async (req, res) => {
  try {
    const sentRequests = await FriendRequest.find({sender: req.user.id, status: 'pending'}).populate('receiver');

    res.status(200).json(sentRequests);
  } catch (error) {
    console.log('friends/sent error: ',error);
    res.status(500).json({ error: error.message });
  }
});
router.get('/received', auth, async (req, res) => {
  try {
    const receivedRequests = await FriendRequest.find({receiver: req.user.id, status: 'pending'}).populate('sender');
    res.status(200).json(receivedRequests);
  } catch (error) {
    console.log('friends/received error: ',error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('friends', '_id name email'); // only populate name and email fields of friends

    res.status(200).json(user.friends);
  } catch (error) {
    console.log('friends/ error: ', error);
    res.status(500).json({ error: error.message });
  }
});


module.exports = router;
