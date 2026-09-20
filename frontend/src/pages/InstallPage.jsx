import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download, Copy, Check, Zap, Smartphone, Apple, GitBranch, Clock, ShieldCheck, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api/client';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Skeleton, EmptyState } from '../components/ui/EmptyState';
import { copyToClipboard } from '../lib/clipboard';

export default function InstallPage() {
  const { id } = useParams();
  const [build, setBuild] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    api.get(`/api/public/builds/${id}`)
      .then((res) => mounted && setBuild(res.data.build))
      .catch(() => mounted && setError('Build not found or no longer available.'))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [id]);

  const download = () => {
    if (build?.downloadUrl) window.location.href = build.downloadUrl;
  };

  const copyUrl = async () => {
    const success = await copyToClipboard(window.location.href);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const PIcon = build?.platform === 'ios' ? Apple : Smartphone;
  const fileType = build?.fileType || (build?.platform === 'ios' ? 'IPA' : 'APK');

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 md:px-10 h-16 flex items-center border-b border-border glass">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div className="text-sm font-bold text-text">Ddeploy Internal</div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-5 py-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[460px]"
        >
          {loading ? (
            <Card><CardBody><Skeleton className="h-48" /></CardBody></Card>
          ) : error || !build ? (
            <Card>
              <EmptyState
                icon={ShieldCheck}
                title="Build not found"
                description={error || 'This install link is no longer available.'}
              />
            </Card>
          ) : (
            <Card>
              <CardBody className="p-7 text-center">
                <motion.div
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 20, delay: 0.1 }}
                  className="relative w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-brand-500/30 to-brand-700/10 border border-brand-500/30 flex items-center justify-center"
                >
                  <PIcon className="w-9 h-9 text-brand-400" />
                </motion.div>

                <h1 className="mt-5 text-xl font-bold text-text">{build.projectName}</h1>
                <p className="mt-1 text-sm text-text-muted">
                  Tap install to download the latest {fileType}
                </p>

                <div className="mt-5 grid grid-cols-3 gap-2 text-left">
                  <Mini label="Version" value={build.version || 'latest'} />
                  <Mini label="Branch" value={build.branch || 'main'} icon={GitBranch} />
                  <Mini label="Built" value={build.builtAt ? new Date(build.builtAt).toLocaleDateString() : '—'} icon={Clock} />
                </div>

                <div className="mt-6 flex flex-col gap-2">
                  {build.downloadUrl ? (
                    <>
                      <Button size="lg" leftIcon={Download} onClick={download} className="w-full">
                        Download {fileType}
                      </Button>
                      <Button variant="ghost" leftIcon={copied ? Check : Copy} onClick={copyUrl} className="w-full">
                        {copied ? 'Link copied' : 'Copy install link'}
                      </Button>
                    </>
                  ) : build.platform === 'ios' ? (
                    <div className="p-4 rounded-[var(--radius-md)] bg-brand-500/10 border border-brand-500/20 text-sm text-text-muted text-center leading-relaxed">
                      ℹ️ iOS builds are distributed via <strong>TestFlight</strong>. Please check the TestFlight app on your registered iOS device to install this build.
                    </div>
                  ) : (
                    <Button variant="ghost" leftIcon={copied ? Check : Copy} onClick={copyUrl} className="w-full">
                      {copied ? 'Link copied' : 'Copy install link'}
                    </Button>
                  )}
                </div>

                {/* QR Code — scan from any device to open this install page */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.25, duration: 0.3 }}
                  className="mt-6 flex flex-col items-center gap-2.5"
                >
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-faint font-semibold">
                    <QrCode className="w-3 h-3" />
                    Scan to install on your device
                  </div>
                  <div className="p-3 rounded-xl bg-white">
                    <QRCodeSVG
                      value={typeof window !== 'undefined' ? window.location.href : `${window.location.origin}/install/${id}`}
                      size={140}
                      level="M"
                      bgColor="#ffffff"
                      fgColor="#111111"
                    />
                  </div>
                  <p className="text-[10px] text-text-faint leading-relaxed max-w-[220px]">
                    Point your phone camera at the QR code to open this page directly
                  </p>
                </motion.div>

                <div className="mt-5 flex items-center justify-center gap-1.5">
                  <Badge tone="success" dot>verified</Badge>
                  <span className="text-[11px] text-text-faint">Build #{build.buildNumber || id.slice(0, 8)}</span>
                </div>
              </CardBody>
            </Card>
          )}
        </motion.div>
      </main>
    </div>
  );
}

function Mini({ label, value, icon: Icon }) {
  return (
    <div className="p-2.5 rounded-[var(--radius-md)] bg-surface-2/60 border border-border">
      <div className="text-[9px] uppercase tracking-wider text-text-faint font-semibold">{label}</div>
      <div className="text-xs font-semibold text-text mt-0.5 flex items-center gap-1 truncate">
        {Icon && <Icon className="w-3 h-3 shrink-0" />}
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}
