import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChatMessage } from './ChatMessage';
import api from '../../api/client';

export function Chatbox() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('ddeploy_chat_history');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse chat history");
      }
    }
    return [
      { role: 'ai', text: 'Hello! I am Ddeploy AI. I can help you trigger builds or create workflows. How can I help you today?' }
    ];
  });
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  useEffect(() => {
    localStorage.setItem('ddeploy_chat_history', JSON.stringify(messages));
  }, [messages]);

  const clearChat = () => {
    if (window.confirm("Are you sure you want to clear the chat history?")) {
      setMessages([
        { role: 'ai', text: 'Hello! I am Ddeploy AI. I can help you trigger builds or create workflows. How can I help you today?' }
      ]);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userMsg = { role: 'user', text: inputValue.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Send history excluding the initial greeting if it's the only one
      const historyToSend = messages.length > 1 ? messages : [];
      
      const response = await api.post('/api/chat', {
        message: userMsg.text,
        history: historyToSend
      });

      if (response.data.success) {
        const aiResponse = response.data.data;
        setMessages(prev => [
          ...prev, 
          { 
            role: 'ai', 
            text: aiResponse.text,
            toolResponse: aiResponse.toolResponse 
          }
        ]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', text: "Sorry, I encountered an error." }]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { role: 'ai', text: "Sorry, I couldn't reach the server. Make sure GEMINI_API_KEY is configured." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 p-4 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all z-50 flex items-center justify-center group"
      >
        <MessageSquare size={24} className="group-hover:scale-110 transition-transform" />
      </button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 w-[400px] h-[600px] max-h-[80vh] bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare size={20} />
                <h3 className="font-semibold text-lg">Ddeploy AI</h3>
              </div>
              <div className="flex gap-1">
                <button 
                  onClick={clearChat}
                  title="Clear Chat"
                  className="p-1.5 hover:bg-white/10 text-slate-400 hover:text-red-400 rounded-md transition-colors"
                >
                  <Trash2 size={18} />
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 hover:bg-white/20 text-slate-200 rounded-md transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-900/50">
              {messages.map((msg, idx) => (
                <ChatMessage key={idx} message={msg} />
              ))}
              {isLoading && (
                <div className="flex gap-2 items-center text-slate-400 text-sm mb-4">
                  <Loader2 size={16} className="animate-spin" />
                  AI is thinking...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-slate-900 border-t border-slate-800">
              <form onSubmit={handleSend} className="relative flex items-center">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask me to trigger a build..."
                  className="w-full pl-4 pr-12 py-3 bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-400 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isLoading}
                  className="absolute right-2 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
