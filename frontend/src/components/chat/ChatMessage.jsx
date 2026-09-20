import React from 'react';
import { Bot, User } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function ChatMessage({ message }) {
  const isAi = message.role === 'ai';

  return (
    <div className={twMerge(clsx("flex gap-3 mb-4", isAi ? "justify-start" : "justify-end"))}>
      {isAi && (
        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
          <Bot size={18} className="text-blue-400" />
        </div>
      )}
      
      <div
        className={twMerge(
          clsx(
            "max-w-[80%] rounded-2xl px-4 py-2 text-sm",
            isAi 
              ? "bg-slate-800 text-slate-200 rounded-tl-sm border border-slate-700" 
              : "bg-blue-600 text-white rounded-tr-sm"
          )
        )}
      >
        <div className="whitespace-pre-wrap leading-relaxed">
          {message.text}
        </div>
        
        {message.toolResponse && (
          <div className="mt-2 text-xs border-t border-slate-700 pt-2 opacity-80">
            <span className={message.toolResponse.success ? "text-green-400" : "text-red-400"}>
              {message.toolResponse.message}
            </span>
          </div>
        )}
      </div>

      {!isAi && (
        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
          <User size={18} className="text-slate-300" />
        </div>
      )}
    </div>
  );
}
