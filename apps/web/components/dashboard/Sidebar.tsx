'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { UserRole } from '@crm/auth-constants';
import { navItemsForRole } from '@/src/config/navigation';
import { auth } from '@/src/lib/api/client';
import { useRouter } from 'next/navigation';
import styles from './Sidebar.module.css';

interface SidebarProps {
  userRole: UserRole;
}

export default function Sidebar({ userRole }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const navItems = navItemsForRole(userRole);

  const handleLogout = async () => {
    await auth.logout().catch(() => null);
    router.push('/login');
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.brandText}>FitClass CRM</span>
      </div>
      <nav className={styles.nav}>
        {navItems.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={`${styles.navItem} ${pathname.startsWith(item.href) ? styles.active : ''}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className={styles.footer}>
        <button onClick={handleLogout} className={styles.logoutBtn}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
