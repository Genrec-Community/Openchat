import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { MessageCircle, Pin, Settings, LogOut, Crown, Menu, X, ChevronLeft } from 'lucide-react';
import DirectChat from './DirectChat';
import PinnedChat from './PinnedChat';
import SettingsPage from './SettingsPage';

type ChatView = 'direct' | 'pinned' | 'settings';

const ChatLayout: React.FC = () => {
  const [activeView, setActiveView] = useState<ChatView>('direct');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const { user, isOP, logout } = useAuth();

  useEffect(() => {
    const fetchUsers = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('last_active');

      if (error) {
        console.error('Error fetching users:', error);
      } else {
        const onlineCount = (data || []).filter(user => new Date(user.last_active).getTime() > Date.now() - 5 * 60 * 1000).length;
        setOnlineUsers(onlineCount);
      }
    };

    fetchUsers();

    const channel = supabase
      .channel('users_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        fetchUsers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleViewChange = (view: ChatView) => {
    setActiveView(view);
    setSidebarOpen(false);
  };

  const handleLogout = () => {
    logout();
  };

  const renderContent = () => {
    switch (activeView) {
      case 'direct':
        return <DirectChat />;
      case 'pinned':
        return <PinnedChat />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DirectChat />;
    }
  };

  return (
    <div className="h-screen flex bg-zinc-100 dark:bg-zinc-900 transition-colors duration-300">
      {/* Sidebar Overlay for Mobile - moved outside and given lower z-index */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/30 lg:hidden z-20" 
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Modern Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-30 transition-all duration-300 ease-in-out ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } ${sidebarCollapsed ? 'w-20' : 'w-64'} lg:translate-x-0 lg:static lg:inset-0`}>
        
        {/* Sidebar Content */}
        <div className="relative h-full bg-white dark:bg-zinc-800 border-r border-zinc-200 dark:border-zinc-700">
          {/* Sidebar Header */}
          <div className={`flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-700 ${sidebarCollapsed ? 'px-2' : 'px-4'}`}>
            {!sidebarCollapsed && (
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-lg flex items-center justify-center shadow-md">
                  <MessageCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-zinc-800 dark:text-white">OpenChat</h1>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">GenrecAI</p>
                </div>
              </div>
            )}
            
            {sidebarCollapsed && (
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-lg flex items-center justify-center mx-auto shadow-md">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
            )}
            
            {/* Collapse Button - Desktop Only */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden lg:flex p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
            >
              <ChevronLeft className={`w-5 h-5 text-zinc-500 transition-transform duration-300 ${
                sidebarCollapsed ? 'rotate-180' : ''
              }`} />
            </button>
            
            {/* Close Button - Mobile Only */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
            >
              <X className="w-5 h-5 text-zinc-500" />
            </button>
          </div>
          
          {/* Navigation Menu */}
          <nav className="flex-1 p-2 space-y-1.5">
            <NavItem
              icon={<MessageCircle size={20} />}
              text="Direct Chat"
              active={activeView === 'direct'}
              collapsed={sidebarCollapsed}
              onClick={() => handleViewChange('direct')}
            />
            <NavItem
              icon={<Pin size={20} />}
              text="Pinned Messages"
              active={activeView === 'pinned'}
              collapsed={sidebarCollapsed}
              onClick={() => handleViewChange('pinned')}
            />
            <NavItem
              icon={<Settings size={20} />}
              text="Settings"
              active={activeView === 'settings'}
              collapsed={sidebarCollapsed}
              onClick={() => handleViewChange('settings')}
            />
          </nav>
          
          {/* User Profile Section */}
          <div className="p-2 border-t border-zinc-200 dark:border-zinc-700">
            <div className={`flex items-center w-full p-2 rounded-lg ${sidebarCollapsed ? 'justify-center' : 'space-x-3'} transition-all`}>
              <div className="relative flex-shrink-0">
                <div className="w-10 h-10 bg-zinc-200 dark:bg-zinc-600 rounded-full flex items-center justify-center">
                  <span className="text-zinc-700 dark:text-zinc-200 font-semibold">
                    {user?.username?.charAt(0)?.toUpperCase()}
                  </span>
                </div>
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-zinc-800 rounded-full"></div>
              </div>
              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-zinc-800 dark:text-white truncate">
                      {user?.username}
                    </p>
                    <button 
                      onClick={handleLogout} 
                      className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-white rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                    >
                      <LogOut size={16} />
                    </button>
                  </div>
                  {isOP && (
                    <div className="flex items-center space-x-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                      <Crown size={12} />
                      <span>Operator</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="flex items-center justify-between bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 px-4 sm:px-6 h-16 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 bg-zinc-100 dark:bg-zinc-700 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors"
            >
              <Menu size={20} />
            </button>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
              {activeView === 'direct' && 'Direct Chat'}
              {activeView === 'pinned' && 'Pinned Messages'}
              {activeView === 'settings' && 'Settings'}
            </h2>
          </div>
          <div className="flex items-center space-x-2 sm:space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{onlineUsers} Online</span>
            </div>
          </div>
        </header>
        
        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

// NavItem Component for Sidebar
interface NavItemProps {
  icon: React.ReactNode;
  text: string;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon, text, active, collapsed, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center p-2.5 rounded-md text-sm font-medium transition-all duration-200 ${
        active
          ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300 shadow-sm'
          : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200'
      } ${collapsed ? 'justify-center' : 'space-x-3'}`}
      title={collapsed ? text : undefined}
    >
      <div className="flex-shrink-0">{icon}</div>
      {!collapsed && <span className="flex-1 text-left">{text}</span>}
    </button>
  );
};

export default ChatLayout;