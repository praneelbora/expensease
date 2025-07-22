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

    const receiver = await User.findOne({ email });
    if (!receiver) return res.status(404).json({ message: 'Receiver not found' });

    if (receiver._id.equals(senderId)) {
      return res.status(400).json({ message: 'Cannot send request to yourself' });
    }

    const sender = await User.findById(senderId);
    if (!sender) return res.status(404).json({ message: 'Sender not found' });

    // Already friends
    if (sender.friends.includes(receiver._id)) {
      return res.status(400).json({ message: 'You are already friends' });
    }

    // Request already sent
    const existingRequest = await FriendRequest.findOne({
      sender: sender._id,
      receiver: receiver._id,
      status: 'pending',
    });
    if (existingRequest) {
      return res.status(400).json({ message: 'Friend request already sent' });
    }

    // Check if reverse request exists → accept it instead
    const reverseRequest = await FriendRequest.findOne({
      sender: receiver._id,
      receiver: sender._id,
      status: 'pending',
    });

    if (reverseRequest) {
      reverseRequest.status = 'accepted';
      await reverseRequest.save();

      sender.friends.push(receiver._id);
      receiver.friends.push(sender._id);

      await sender.save();
      await receiver.save();

      return res.status(200).json({ message: 'Friend request auto-accepted' });
    }

    // Create new friend request
    const newRequest = new FriendRequest({
      sender: sender._id,
      receiver: receiver._id,
      status: 'pending',
    });

    await newRequest.save();

    res.status(201).json({ message: 'Friend request sent', request: newRequest });

  } catch (error) {
    console.error('friends/request error:', error);
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

router.post('/cancel', auth, async (req, res) => {
  try {
    const { requestId } = req.body;
    const request = await FriendRequest.findById(requestId);

    if (!request || request.sender.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized' });
    }
    await FriendRequest.findByIdAndDelete(requestId);
    res.json({ msg: 'Friend request deleted' });
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

router.post('/request-link', auth, async (req, res) => {
  try {
    const { toId } = req.body; // could be JWT or senderId encoded
    const userId = req.user.id;
    
    if (userId === toId) {
      return res.status(400).json({ message: "Cannot accept your own invite" });
    }

    const sender = await User.findById(userId);
    const receiver = await User.findById(toId);

    if (!sender || !receiver) return res.status(404).json({ message: 'User not found' });

    // Same logic as existing
    if (receiver.friends.includes(sender._id)) {
      return res.status(400).json({ message: 'Already friends' });
    }

    const reverseRequest = await FriendRequest.findOne({
      sender: receiver._id,
      receiver: sender._id,
      status: 'pending',
    });

    if (reverseRequest) {
      reverseRequest.status = 'accepted';
      await reverseRequest.save();
      receiver.friends.push(sender._id);
      sender.friends.push(receiver._id);
      await receiver.save();
      await sender.save();
      return res.status(200).json({ message: 'Friend request accepted from link' });
    }

    const existingRequest = await FriendRequest.findOne({
      sender: sender._id,
      receiver: receiver._id,
      status: 'pending',
    });

    if (existingRequest) {
      return res.status(400).json({ message: 'Request already sent' });
    }

    const newRequest = new FriendRequest({
      sender: sender._id,
      receiver: receiver._id,
      status: 'pending',
    });

    await newRequest.save();

    res.status(201).json({ message: 'Friend request sent via link' });
  } catch (error) {
    console.error('from-link error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /v1/friends/:friendId
router.get('/:friendId', auth, async (req, res) => {
  try {
    const { friendId } = req.params;
    const user = await User.findById(friendId).select('_id name email'); // Add more fields if needed
    
    if (!user) {
      return res.status(404).json({ message: 'Friend not found' });
    }

    res.status(200).json({friend: user, id: req.user.id});
  } catch (error) {
    console.error('getFriendDetails error:', error);
    res.status(500).json({ error: error.message });
  }
});


module.exports = router;
