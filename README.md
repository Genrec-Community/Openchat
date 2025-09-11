# OpenChat

A modern, real-time chat application built with React, TypeScript, and Supabase. OpenChat provides a clean, responsive interface for instant messaging with theme customization and user authentication.

## 🚀 Features

- **Real-time Messaging**: Instant chat functionality powered by Supabase real-time subscriptions
- **User Authentication**: Secure user sessions and profile management
- **Dual Chat Types**: 
  - Direct messages (expire after 24 hours)
  - Pinned messages (permanent, OP-only)
- **Theme Support**: Light and dark mode with user preferences
- **Responsive Design**: Modern UI built with TailwindCSS
- **Modular Architecture**: Clean, maintainable component structure
- **TypeScript**: Full type safety and enhanced developer experience

## 🛠️ Technology Stack

### Frontend
- **React** 19.1.1 - UI Framework
- **TypeScript** 5.8.3 - Type-safe JavaScript
- **Vite** 7.1.2 - Fast build tool and dev server
- **TailwindCSS** 3.4.17 - Utility-first CSS framework
- **React Router DOM** 7.8.2 - Client-side routing
- **Lucide React** 0.541.0 - Beautiful icons

### Backend & Services
- **Supabase** 2.56.0 - Backend-as-a-Service (Database, Auth, Real-time)
- **PostgreSQL** - Database (via Supabase)

### Development Tools
- **ESLint** - Code linting and formatting
- **PostCSS** - CSS processing
- **Autoprefixer** - CSS vendor prefixes

## 📋 Prerequisites

Before running this project, make sure you have:

- **Node.js** 18.0 or higher
- **npm** or **yarn** package manager
- **Supabase Account** - For backend services
- **Git** - For version control

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone <repository-url>
cd openchat
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
Create a `.env.local` file in the root directory:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Database Setup
1. Create a new Supabase project
2. Run the provided SQL schema in your Supabase SQL editor:
```bash
# Execute the database_schema.sql file in your Supabase dashboard
```

### 5. Start Development Server
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## 📜 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build production bundle |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint code analysis |

## 🏗️ Project Structure

```
openchat/
├── src/
│   ├── components/          # React components
│   │   ├── ChatLayout.tsx   # Main chat interface
│   │   ├── DirectChat.tsx   # Direct messaging component
│   │   ├── LoginPage.tsx    # User authentication
│   │   ├── PinnedChat.tsx   # Pinned messages display
│   │   └── SettingsPage.tsx # User settings and preferences
│   ├── contexts/            # React Context providers
│   │   ├── AuthContext.tsx  # Authentication state management
│   │   └── ThemeContext.tsx # Theme state management
│   ├── lib/                 # External service integrations
│   │   └── supabase.ts      # Supabase client configuration
│   ├── services/            # Background services
│   │   └── messageCleanup.ts # Automated message cleanup
│   ├── types/               # TypeScript type definitions
│   │   └── index.ts         # Shared type interfaces
│   ├── App.tsx              # Main application component
│   ├── main.tsx             # Application entry point
│   └── index.css            # Global styles
├── database_schema.sql      # Supabase database schema
├── package.json             # Project dependencies and scripts
├── vite.config.ts           # Vite configuration
├── tailwind.config.js       # TailwindCSS configuration
└── tsconfig.json            # TypeScript configuration
```

## 🔧 Configuration

### Supabase Setup
1. Create tables using `database_schema.sql`
2. Configure Row Level Security (RLS) policies
3. Enable real-time subscriptions
4. Set up authentication providers if needed

### Environment Variables
Required environment variables:
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anonymous key

### TailwindCSS
The project uses TailwindCSS v3.4.0 for styling. Configuration can be modified in `tailwind.config.js`.

## 🌟 Key Features Explained

### Authentication System
- Anonymous user creation with unique usernames
- Session management via Supabase Auth
- OP (moderator) role support for administrative functions

### Message Types
1. **Direct Messages**: Regular chat messages that automatically expire after 24 hours
2. **Pinned Messages**: Important announcements that persist permanently (OP-only)

### Real-time Updates
- Live message updates using Supabase real-time subscriptions
- Automatic UI updates when new messages arrive
- Real-time user activity tracking

### Theme System
- Light and dark mode support
- User preference persistence
- Seamless theme switching

## 🔐 Security Features

- **Row Level Security (RLS)**: Database-level access control
- **Environment Variables**: Secure configuration management
- **Type Safety**: TypeScript prevents runtime errors
- **Input Validation**: Proper data validation and sanitization

## 🚀 Deployment

### Build for Production
```bash
npm run build
```

### Deployment Options
- **Vercel**: Zero-config deployment for Vite apps
- **Netlify**: Static site hosting with continuous deployment
- **GitHub Pages**: Free hosting for static sites
- **Any static hosting service**

### Environment Configuration
Ensure environment variables are properly configured in your hosting platform.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Use ESLint for code formatting
- Write meaningful component and function names
- Keep components focused and reusable
- Add proper type definitions for new features

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 🐛 Troubleshooting

### Common Issues

**Build Errors**
- Ensure all environment variables are set
- Check Node.js version compatibility
- Clear node_modules and reinstall dependencies

**Supabase Connection Issues**
- Verify environment variables are correct
- Check Supabase project status
- Ensure database schema is properly applied

**Real-time Not Working**
- Confirm Supabase real-time is enabled
- Check browser console for connection errors
- Verify RLS policies allow required operations

## 📞 Support

For questions, issues, or contributions:
- Open an issue on GitHub
- Check existing documentation
- Review the database schema for data structure questions

## 🔄 Version History

- **v0.0.0** - Initial release with core chat functionality
- Real-time messaging with Supabase
- User authentication and session management
- Theme customization support
- Mobile-responsive design

---

**Built with ❤️ using React, TypeScript, and Supabase**