// src/controllers/chatController.js

const { db } = require('../config/firebaseConfig');  // ✅ Corrected path

const { collection, getDocs, writeBatch, doc, deleteDoc } = require('firebase/firestore');

// 🚫 Banned words list for message validation
const bannedWords = ['abuse', 'idiot', 'examplebadword'];

/**
 * Middleware to validate chat messages for banned words.
 */
function validateMessage(req, res, next) {
    const { message } = req.body;
    if (message) {
        const hasBannedWord = bannedWords.some(word =>
            message.toLowerCase().includes(word)
        );
        if (hasBannedWord) {
            return res.status(400).json({ error: "Your message contains inappropriate language." });
        }
    }
    next();
}

/**
 * Controller to delete a single chat message by ID.
 */
async function deleteChatMessage(req, res) {
    try {
        const { messageId } = req.params;
        if (!messageId) {
            return res.status(400).json({ error: 'Message ID is required.' });
        }

        const messageRef = doc(db, 'chat_messages', messageId);
        await deleteDoc(messageRef);

        res.status(200).json({ message: 'Message deleted successfully.' });
    } catch (error) {
        console.error('Error deleting chat message:', error);
        res.status(500).json({ error: 'Failed to delete message.' });
    }
}

/**
 * Controller to clear all chat messages.
 */
async function clearAllChat(req, res) {
    try {
        const messagesCollection = collection(db, 'chat_messages');
        const messagesSnapshot = await getDocs(messagesCollection);

        if (messagesSnapshot.empty) {
            return res.status(200).json({ message: 'Chat is already empty.' });
        }

        const batch = writeBatch(db);
        messagesSnapshot.forEach((messageDoc) => {
            batch.delete(messageDoc.ref);
        });

        await batch.commit();
        res.status(200).json({ message: 'Chat history cleared successfully.' });
    } catch (error) {
        console.error('Error clearing chat history:', error);
        res.status(500).json({ error: 'Failed to clear chat history.' });
    }
}

module.exports = {
    validateMessage,
    deleteChatMessage,
    clearAllChat,
};
