import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useOrderNotes, useCreateOrderNote, useDeleteOrderNote } from '../../hooks/useOrderNotes';
import { useToast } from '../../hooks/useToast';
import { NoteType, UserRole } from '../../types';
import SpotlightCard from '../ui/SpotlightCard';
import { MessageSquare, Star, Trash2, Phone, AlertTriangle, FileText, Send } from 'lucide-react';

const NOTE_TYPE_CONFIG: Record<NoteType, { label: string; icon: React.ReactNode; color: string }> = {
  quality_feedback: { label: 'Quality Feedback', icon: <Star className="w-3.5 h-3.5" />, color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
  customer_call: { label: 'Customer Call', icon: <Phone className="w-3.5 h-3.5" />, color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  complaint: { label: 'Complaint', icon: <AlertTriangle className="w-3.5 h-3.5" />, color: 'text-red-400 bg-red-400/10 border-red-400/20' },
  general: { label: 'General', icon: <FileText className="w-3.5 h-3.5" />, color: 'text-slate-400 bg-slate-400/10 border-slate-400/20' },
};

const StarRating: React.FC<{ rating: number; onChange: (r: number) => void }> = ({ rating, onChange }) => (
  <div className="flex gap-1">
    {[1, 2, 3, 4, 5].map((star) => (
      <button
        key={star}
        type="button"
        onClick={() => onChange(star === rating ? 0 : star)}
        className={`transition-colors ${star <= rating ? 'text-yellow-400' : 'text-slate-600 hover:text-slate-400'}`}
      >
        <Star className="w-5 h-5" fill={star <= rating ? 'currentColor' : 'none'} />
      </button>
    ))}
  </div>
);

const StarDisplay: React.FC<{ rating: number }> = ({ rating }) => (
  <div className="flex gap-0.5">
    {[1, 2, 3, 4, 5].map((star) => (
      <Star
        key={star}
        className={`w-3.5 h-3.5 ${star <= rating ? 'text-yellow-400' : 'text-slate-700'}`}
        fill={star <= rating ? 'currentColor' : 'none'}
      />
    ))}
  </div>
);

interface OrderNotesSectionProps {
  orderId: number;
}

const OrderNotesSection: React.FC<OrderNotesSectionProps> = ({ orderId }) => {
  const { user, role } = useAuth();
  const { data: notes = [], isLoading } = useOrderNotes(orderId);
  const createNote = useCreateOrderNote();
  const deleteNote = useDeleteOrderNote();
  const { success: showSuccess, error: showError } = useToast();

  const [content, setContent] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('quality_feedback');
  const [rating, setRating] = useState(0);
  const isAdmin = role === UserRole.ADMIN;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !user) return;

    try {
      await createNote.mutateAsync({
        orderId,
        userId: user.id,
        userEmail: user.email!,
        userName: user.user_metadata?.full_name || user.email || '',
        noteType,
        content: content.trim(),
        rating: (noteType === 'quality_feedback' && rating > 0) ? rating : null,
      });
      setContent('');
      setRating(0);
      showSuccess('Note added successfully');
    } catch {
      showError('Failed to add note');
    }
  };

  const handleDelete = async (noteId: number) => {
    try {
      await deleteNote.mutateAsync({ noteId, orderId });
      showSuccess('Note deleted');
    } catch {
      showError('Failed to delete note');
    }
  };

  return (
    <SpotlightCard className="p-6">
      <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-brand-orange" />
        Customer Notes & Feedback
        {notes.length > 0 && (
          <span className="text-xs font-normal bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
            {notes.length}
          </span>
        )}
      </h3>

      {/* Add Note Form */}
      <form onSubmit={handleSubmit} className="mb-6 space-y-3">
        <div className="flex flex-wrap gap-2">
          {(Object.entries(NOTE_TYPE_CONFIG) as [NoteType, typeof NOTE_TYPE_CONFIG[NoteType]][]).map(([type, config]) => (
            <button
              key={type}
              type="button"
              onClick={() => setNoteType(type)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                noteType === type
                  ? config.color + ' ring-1 ring-current'
                  : 'text-slate-500 bg-slate-800/50 border-slate-700 hover:border-slate-600'
              }`}
            >
              {config.icon}
              {config.label}
            </button>
          ))}
        </div>

        {noteType === 'quality_feedback' && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400">Quality Rating:</span>
            <StarRating rating={rating} onChange={setRating} />
            {rating > 0 && <span className="text-xs text-slate-500">{rating}/5</span>}
          </div>
        )}

        <div className="flex gap-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What did the customer say about the patches quality, delivery, etc..."
            className="flex-1 bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange/50 resize-none"
            rows={2}
          />
          <button
            type="submit"
            disabled={!content.trim() || createNote.isPending}
            className="self-end px-4 py-3 bg-brand-orange text-white rounded-xl hover:bg-brand-orange/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Notes List */}
      {isLoading ? (
        <div className="text-center py-6 text-slate-500 text-sm">Loading notes...</div>
      ) : notes.length === 0 ? (
        <div className="text-center py-6 text-slate-600 text-sm">
          No notes yet. Be the first to add feedback from the customer.
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {notes.map((note) => {
            const config = NOTE_TYPE_CONFIG[note.noteType] || NOTE_TYPE_CONFIG.general;
            const canDelete = isAdmin || note.userId === user?.id;

            return (
              <div key={note.id} className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${config.color}`}>
                        {config.icon}
                        {config.label}
                      </span>
                      {note.rating && <StarDisplay rating={note.rating} />}
                      <span className="text-xs text-slate-500">
                        {new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {' '}
                        {new Date(note.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 whitespace-pre-wrap">{note.content}</p>
                    <p className="text-xs text-slate-500 mt-2">
                      — {note.userName || note.userEmail.split('@')[0]}
                    </p>
                  </div>
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(note.id)}
                      disabled={deleteNote.isPending}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-600 hover:text-red-400 transition-all rounded-lg hover:bg-red-400/10"
                      title="Delete note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SpotlightCard>
  );
};

export default OrderNotesSection;
