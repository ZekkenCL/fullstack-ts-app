module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        discord: {
          primary: '#5865f2',
          success: '#57f287',
          warning: '#fee75c',
            danger: '#ed4245',
          background: '#313338',      // main chat bg
          'bg-alt': '#2b2d31',         // left sidebar
          'bg-dark': '#1e1f22',        // app background
          'bg-hover': '#3c3f45',
          'border': '#1f2123',
          'text': '#dbdee1',
          'text-muted': '#949ba4',
          'channel-unread-pill': '#f23f42',
          'input': '#383a40'
        }
      },
      boxShadow: {
        'inner-sm': 'inset 0 0 0 1px rgba(255,255,255,0.03)'
      }
    },
  },
  plugins: [],
}