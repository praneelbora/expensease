// routes/friends.js
const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const Expense = require('../../models/Expense');
const Loan = require('../../models/Loan');
const FriendRequest = require('../../models/FriendRequest');
const bcrypt = require('bcryptjs');
const auth = require("../../middleware/auth");
const jwt = require('jsonwebtoken');
const notif = require('../v1/notifs'); // single-file notif helper (sendToUsers, pushNotifications, etc.)

/* ------------------------
   Small notification helpers (use category + opts)
   ------------------------ */
const notify = {
  friendRequestReceived: async ({ receiverId, senderName, requestId, senderId }) => {
    const title = 'Friend request';
    const body = `${senderName} sent you a friend request`;
    const data = { type: 'friend_request', requestId: String(requestId) };
    const category = 'friend_request';
    const opts = { channel: 'push', fromFriendId: String(senderId) };
    return notif.sendToUsers([String(receiverId)], title, body, data, category, opts)
      .catch(e => console.error('notify.friendRequestReceived failed', e));
  },
  friendRequestAccepted: async ({ toUserId, fromUserName, accepterId }) => {
    const title = 'Friend request accepted';
    const body = `${fromUserName} accepted your friend request`;
    const data = { type: 'friend_request_accepted' };
    const category = 'friend_request';
    const opts = { channel: 'push', fromFriendId: String(accepterId) };
    return notif.sendToUsers([String(toUserId)], title, body, data, category, opts)
      .catch(e => console.error('notify.friendRequestAccepted failed', e));
  },
  friendRequestRejected: async ({ toUserId, fromUserName, rejecterId }) => {
    const title = 'Friend request rejected';
    const body = `${fromUserName} rejected your friend request`;
    const data = { type: 'friend_request_rejected' };
    const category = 'friend_request';
    const opts = { channel: 'push', fromFriendId: String(rejecterId) };
    return notif.sendToUsers([String(toUserId)], title, body, data, category, opts)
      .catch(e => console.error('notify.friendRequestRejected failed', e));
  },
  friendRequestCancelled: async ({ receiverId, senderName, senderId }) => {
    const title = 'Friend request cancelled';
    const body = `${senderName} cancelled the friend request`;
    const data = { type: 'friend_request_cancelled' };
    const category = 'friend_request';
    const opts = { channel: 'push', fromFriendId: String(senderId) };
    return notif.sendToUsers([String(receiverId)], title, body, data, category, opts)
      .catch(e => console.error('notify.friendRequestCancelled failed', e));
  },
  friendRemoved: async ({ removedUserId, byName, removerId }) => {
    const title = 'Removed as friend';
    const body = `${byName} removed you as a friend`;
    const data = { type: 'friend_removed' };
    const category = 'groups'; // this is personal but not an expense — keep as general 'groups' or 'friend_request' if you prefer
    const opts = { channel: 'push', fromFriendId: String(removerId) };
    return notif.sendToUsers([String(removedUserId)], title, body, data, category, opts)
      .catch(e => console.error('notify.friendRemoved failed', e));
  },
  autoAccepted: async ({ userAId, userBId, accepterName, accepterId }) => {
    const title = 'Friend request accepted';
    const body = `${accepterName} accepted the friend request`;
    const data = { type: 'friend_auto_accepted' };
    const category = 'friend_request';
    const opts = { channel: 'push', fromFriendId: String(accepterId) };
    return notif.sendToUsers([String(userAId), String(userBId)], title, body, data, category, opts)
      .catch(e => console.error('notify.autoAccepted failed', e));
  }
};

/* ------------------------
   Routes
   ------------------------ */

router.post('/request', auth, async (req, res) => {
  try {
    // Accept { type, value } and keep backward compatibility with { email }
    let { type, value, email } = req.body || {};
    const senderId = req.user.id;

    // Back-compat: if only `email` was sent
    if (!type && email) {
      type = 'email';
      value = email;
    }

    if (!type || !value) {
      return res.status(400).json({ message: 'Missing "type" or "value". Expected { type: "email"|"phone"|"userId", value: string }' });
    }

    // Basic normalizers
    const normalizeEmail = (v) => String(v).trim().toLowerCase();
    const normalizePhone = (v) => {
      // very light normalization: strip spaces/dashes/parentheses
      const cleaned = String(v).replace(/[^\d+]/g, '').trim();
      return cleaned;
    };

    // Locate receiver based on type
    let receiver = null;
    if (type === 'userId' || type === 'id' || type === '_id' || type === 'Id') {
      receiver = await User.findById(value);
    } else if (type === 'email') {
      receiver = await User.findOne({ email: normalizeEmail(value) });
    } else if (type === 'phone') {
      const phone = normalizePhone(value);
      // Adjust these fields according to your User schema
      receiver = await User.findOne({
        $or: [
          { phone },                 // if you store a single phone
          { phones: phone },         // if you store an array of strings
          { 'phones.value': phone }, // if you store array of objects like { value, label }
        ],
      });
    } else {
      return res.status(400).json({ message: 'Invalid type. Use "email", "phone", or "userId".' });
    }

    if (!receiver) return res.status(404).json({ message: 'Receiver not found' });

    if (receiver._id.equals(senderId)) {
      return res.status(400).json({ message: 'Cannot send request to yourself' });
    }

    const sender = await User.findById(senderId);
    if (!sender) return res.status(404).json({ message: 'Sender not found' });

    // Already friends?
    if (sender.friends?.some((id) => id.equals(receiver._id))) {
      return res.status(400).json({ message: 'You are already friends' });
    }

    // Existing pending request from sender → receiver?
    const existingRequest = await FriendRequest.findOne({
      sender: sender._id,
      receiver: receiver._id,
      status: 'pending',
    });
    if (existingRequest) {
      return res.status(400).json({ message: 'Friend request already sent' });
    }

    // Reverse pending request (receiver → sender)? If so, auto-accept.
    const reverseRequest = await FriendRequest.findOne({
      sender: receiver._id,
      receiver: sender._id,
      status: 'pending',
    });

    if (reverseRequest) {
      reverseRequest.status = 'accepted';
      await reverseRequest.save();

      sender.friends = Array.isArray(sender.friends) ? sender.friends : [];
      receiver.friends = Array.isArray(receiver.friends) ? receiver.friends : [];

      if (!sender.friends.some((id) => id.equals(receiver._id))) sender.friends.push(receiver._id);
      if (!receiver.friends.some((id) => id.equals(sender._id))) receiver.friends.push(sender._id);

      await sender.save();
      await receiver.save();

      (async () => {
        try {
          await notify.autoAccepted({
            userAId: sender._id,
            userBId: receiver._id,
            accepterName: receiver.name || 'Someone',
            accepterId: receiver._id,
          });
        } catch (e) {
          console.error('auto-accept notification failed', e);
        }
      })();

      return res.status(200).json({ message: 'Friend request auto-accepted' });
    }

    // Create new friend request
    const newRequest = new FriendRequest({
      sender: sender._id,
      receiver: receiver._id,
      status: 'pending',
    });
    await newRequest.save();

    (async () => {
      try {
        await notify.friendRequestReceived({
          receiverId: receiver._id,
          senderName: sender.name || 'Someone',
          requestId: newRequest._id,
          senderId: sender._id,
        });
      } catch (e) {
        console.error('friend request notification failed', e);
      }
    })();

    return res.status(201).json({ message: 'Friend request sent', request: newRequest });
  } catch (error) {
    console.error('friends/request error:', error);
    return res.status(500).json({ error: error.message });
  }
});


module.exports = router