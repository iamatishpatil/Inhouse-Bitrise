// src/controllers/ai.controller.js
const aiService = require('../services/ai.service');

const handleChat = async (req, res, next) => {
  try {
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: 'Message is required.' });
    }

    const response = await aiService.handleChatMessage(message, history || []);

    return res.status(200).json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('Error in AI Chat controller:', error);
    next(error);
  }
};

module.exports = {
  handleChat
};
