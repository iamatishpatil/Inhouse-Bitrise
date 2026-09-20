import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, Zap, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);

      if (result.success) {
        toast.success('Welcome back!', email);
        navigate('/dashboard');
      } else {
        setError(result.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[420px]"
      >
        <div className="flex flex-col items-center mb-6">
          <motion.div
            initial={{ scale: 0.6, rotate: -10, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 280, damping: 20, delay: 0.1 }}
            className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-[0_20px_60px_-20px_rgba(124,58,237,0.7)]"
          >
            <Zap className="w-7 h-7 text-white" />
          </motion.div>

          <h1 className="mt-5 text-2xl font-bold tracking-tight text-text">
            Welcome back
          </h1>

          <p className="mt-1.5 text-sm text-text-muted">
            Sign in to continue to Ddeploy.
          </p>
        </div>

        <div className="glass border border-border-strong rounded-[var(--radius-lg)] p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 py-2 rounded-[var(--radius-md)] bg-danger/10 border border-danger/30 text-sm text-danger text-center">
                    {error}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <Input
              label="Email"
              placeholder="you@company.com"
              type="email"
              leftIcon={Mail}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />

            <Input
              label="Password"
              placeholder="••••••••"
              type="password"
              leftIcon={Lock}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              minLength={6}
            />

            <Button
              type="submit"
              size="lg"
              loading={loading}
              rightIcon={loading ? undefined : ArrowRight}
              className="mt-1"
            >
              Sign in
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}