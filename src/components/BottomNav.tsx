import { CheckSquare, Gift, Home, Package, Wallet } from 'lucide-react';
import { motion } from 'motion/react';
import type { NavTab } from '../types/farm';

interface BottomNavProps {
  activeTab: NavTab;
  hasClaimableTasks: boolean;
  labels: {
    farm: string;
    packs: string;
    ranks?: string;
    tasks: string;
    friends: string;
    wallet: string;
  };
  onSelectTab: (tab: NavTab) => void;
}

export function BottomNav({
  activeTab,
  hasClaimableTasks,
  labels,
  onSelectTab,
}: BottomNavProps) {
  const items: { id: NavTab; label: string; icon: typeof Home; badge?: boolean }[] = [
    { id: 'farm', label: labels.farm, icon: Home },
    { id: 'packs', label: labels.packs, icon: Package },
    { id: 'tasks', label: labels.tasks, icon: CheckSquare, badge: hasClaimableTasks },
    { id: 'friends', label: labels.friends, icon: Gift },
    { id: 'wallet', label: labels.wallet, icon: Wallet },
  ];

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed bottom-0 left-0 right-0 z-40 clay-bottom-nav transition-colors"
    >
      <div className="max-w-xl mx-auto grid grid-cols-5 h-16 px-1.5 gap-1 items-center">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center min-h-[48px] rounded-2xl px-1 cursor-pointer transition-colors ${
                active
                  ? 'text-amber-950'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-white/50 dark:hover:bg-stone-800/50'
              }`}
            >
              {active && (
                <motion.div
                  layoutId="alpha-bottom-nav-active"
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  className="clay-btn-amber absolute inset-0 rounded-2xl -z-10"
                />
              )}
              <motion.div
                animate={{ scale: active ? 1.08 : 1, y: active ? -1 : 0 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="relative"
              >
                <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : 'stroke-[2]'}`} />
                {item.badge && (
                  <span
                    className="animate-clay-badge absolute -top-1 -right-1.5 w-2.5 h-2.5 rounded-full bg-rose-500 border-2 border-white dark:border-stone-900 shadow-xs"
                    aria-label="Tasks available"
                  />
                )}
              </motion.div>
              <span className="text-[11px] font-extrabold mt-0.5 whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
