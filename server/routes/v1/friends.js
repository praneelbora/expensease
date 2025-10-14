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
const notif = require('./notifs'); // single-file notif helper (sendToUsers, pushNotifications, etc.)

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
      console.log(req.body);
      
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

            // notify both parties that they are now friends (best-effort)
            (async () => {
              try {
                await notify.autoAccepted({
                  userAId: sender._id,
                  userBId: receiver._id,
                  accepterName: receiver.name || 'Someone',
                  accepterId: receiver._id
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

        // Notify receiver (best-effort)
        (async () => {
          try {
            await notify.friendRequestReceived({
              receiverId: receiver._id,
              senderName: sender.name || 'Someone',
              requestId: newRequest._id,
              senderId: sender._id
            });
          } catch (e) {
            console.error('friend request notification failed', e);
          }
        })();

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

        let sender = await User.findById(request.sender._id);
        let receiver = await User.findById(request.receiver._id);

        // ✅ Only add if not already friends
        if (!sender.friends.includes(receiver._id)) {
            sender.friends.push(receiver._id);
        }

        if (!receiver.friends.includes(sender._id)) {
            receiver.friends.push(sender._id);
        }

        await sender.save();
        await receiver.save();

        // Notify original sender that request was accepted (best-effort)
        (async () => {
          try {
            await notify.friendRequestAccepted({
              toUserId: sender._id,
              fromUserName: receiver.name || 'Someone',
              accepterId: receiver._id
            });
          } catch (e) {
            console.error('accept notification failed', e);
          }
        })();

        res.json({ msg: 'Friend request accepted' });
    } catch (error) {
        console.log('friends/accept error: ', error);
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

        // Notify sender that request was rejected (best-effort)
        (async () => {
          try {
            const receiver = await User.findById(req.user.id).select('name').lean();
            await notify.friendRequestRejected({
              toUserId: request.sender,
              fromUserName: receiver?.name || 'Someone',
              rejecterId: req.user.id
            });
          } catch (e) {
            console.error('reject notification failed', e);
          }
        })();

        res.json({ msg: 'Friend request rejected' });
    } catch (error) {
        console.log('friends/reject error: ', error);
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

        // Notify receiver that sender cancelled (best-effort)
        (async () => {
          try {
            const sender = await User.findById(req.user.id).select('name').lean();
            await notify.friendRequestCancelled({
              receiverId: request.receiver,
              senderName: sender?.name || 'Someone',
              senderId: req.user.id
            });
          } catch (e) {
            console.error('cancel notification failed', e);
          }
        })();

        res.json({ msg: 'Friend request deleted' });
    } catch (error) {
        console.log('friends/reject error: ', error);
        res.status(500).json({ error: error.message });
    }

});

router.get('/sent', auth, async (req, res) => {
    try {
        const sentRequests = await FriendRequest.find({ sender: req.user.id, status: 'pending' }).populate('receiver');

        res.status(200).json(sentRequests);
    } catch (error) {
        console.log('friends/sent error: ', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/received', auth, async (req, res) => {
    try {
        const receivedRequests = await FriendRequest.find({ receiver: req.user.id, status: 'pending' }).populate('sender');
        res.status(200).json(receivedRequests);
    } catch (error) {
        console.log('friends/received error: ', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .populate('friends', '_id name email picture avatarId'); // only populate name and email fields of friends
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

            // notify both parties that they are now friends
            (async () => {
              try {
                await notify.autoAccepted({
                  userAId: sender._id,
                  userBId: receiver._id,
                  accepterName: receiver.name || 'Someone',
                  accepterId: receiver._id
                });
              } catch (e) {
                console.error('auto-accept (link) notification failed', e);
              }
            })();

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

        // notify receiver (best-effort)
        (async () => {
          try {
            await notify.friendRequestReceived({
              receiverId: receiver._id,
              senderName: sender.name || 'Someone',
              requestId: newRequest._id,
              senderId: sender._id
            });
          } catch (e) {
            console.error('request-link notification failed', e);
          }
        })();

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
        if (!friendId)
            return res.status(404).json({ message: 'Friend id not recieved' });
        const user = await User.findById(friendId).select('_id name email upiId'); // Add more fields if needed

        if (!user) {
            return res.status(404).json({ message: 'Friend not found' });
        }

        res.status(200).json({ friend: user, id: req.user.id });
    } catch (error) {
        console.error('getFriendDetails error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /v1/friends/remove
router.post('/remove', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { friendId } = req.body;

        if (userId === friendId) {
            return res.status(400).json({ message: "Cannot remove yourself as a friend" });
        }

        // 1. Check unsettled expenses (where mode: 'split' and either owes or is owed)
        const unsettledExpenses = await Expense.find({
            mode: 'split',
            groupId: null, // not part of a group
            "splits.friendId": { $all: [userId, friendId] }, // both are in splits
            $expr: { $eq: [{ $size: "$splits" }, 2] }, // exactly two splits
            "splits.oweAmount": { $gt: 0 } // at least one owes
        });
        // 2. Check unsettled loans (status not 'closed' between the two)
        const unsettledLoans = await Loan.find({
            $or: [
                { lenderId: userId, borrowerId: friendId, status: { $ne: 'closed' } },
                { lenderId: friendId, borrowerId: userId, status: { $ne: 'closed' } }
            ]
        });
        if (unsettledExpenses.length > 0 || unsettledLoans.length > 0) {
            return res.status(400).json({
                message: "Cannot remove friend until all shared expenses and loans are settled",
                unsettledExpenses: unsettledExpenses.length,
                unsettledLoans: unsettledLoans.length
            });
        }

        // All clear—remove friend relationship
        const user = await User.findById(userId);
        const friend = await User.findById(friendId);

        if (!user || !friend) {
            return res.status(404).json({ message: "User not found" });
        }

        user.friends = user.friends.filter(id => id.toString() !== friendId);
        friend.friends = friend.friends.filter(id => id.toString() !== userId);

        await user.save();
        await friend.save();

        // Notify removed friend (best-effort)
        (async () => {
          try {
            const by = await User.findById(userId).select('name').lean();
            await notify.friendRemoved({
              removedUserId: friendId,
              byName: by?.name || 'Someone',
              removerId: userId
            });
          } catch (e) {
            console.error('remove notification failed', e);
          }
        })();

        res.status(200).json({ message: "Friend removed successfully" });
    } catch (error) {
        console.error('friends/remove error:', error);
        res.status(500).json({ error: error.message });
    }
});


module.exports = router;
