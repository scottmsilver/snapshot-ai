# Snapshot AI

A powerful web-based image annotation and markup tool built with React, TypeScript, and Konva.js.

## Features

### Drawing Tools
- **Select Tool** - Select, move, and transform shapes
- **Pen Tool** - Freehand drawing with smooth curves
- **Rectangle Tool** - Draw rectangles with optional fill
- **Circle Tool** - Draw perfect circles with optional fill
- **Arrow Tool** - Create arrows with adjustable endpoints
- **Text Tool** - Add text annotations with customizable fonts
- **Callout Tool** - Create callouts with curved arrows pointing to specific areas
- **Star Tool** - Add star shapes with customizable points
- **Measurement Tool** - Measure distances with real-world unit calibration

### Measurement Features
- **Scale Calibration** - Set a reference scale by measuring a known distance
- **Unit Support** - mm, cm, m, inches, feet
- **Live Editing** - Resize measurements by dragging endpoints
- **Architect's Scale** - Visual scale reference at bottom of canvas

### Advanced Features
- **Google Drive Integration** - Save and load projects from Google Drive
- **Auto-save** - Automatic saving every 30 seconds when signed in
- **Share Links** - Share read-only links to your annotations
- **Export Options** - Copy to clipboard or download as PNG
- **Undo/Redo** - Full history support with keyboard shortcuts
- **Layer Management** - Bring forward/backward, bring to front/send to back

### Keyboard Shortcuts
- `V` - Select tool
- `P` - Pen tool
- `R` - Rectangle tool
- `C` - Circle tool
- `A` - Arrow tool
- `T` - Text tool
- `L` - Callout tool
- `S` - Star tool
- `M` - Measurement tool
- `Ctrl/Cmd + Z` - Undo
- `Ctrl/Cmd + Y` - Redo
- `Ctrl/Cmd + C` - Copy to clipboard
- `Ctrl/Cmd + S` - Save/Download
- `Delete/Backspace` - Delete selected shapes
- `Escape` - Cancel current operation or clear selection

## Getting Started

### Prerequisites
- Node.js 18+ and npm

### Installation

```bash
# Clone the repository
git clone https://github.com/scottmsilver/snapshot-ai.git
cd snapshot-ai

# Install dependencies
npm install

# Start development server
npm run dev
```

### Building for Production

```bash
# Build the application
npm run build

# Preview the production build
npm run preview
```

## Development

### Project Structure
```
src/
├── components/     # React components
├── contexts/       # React contexts for state management
├── hooks/          # Custom React hooks
├── services/       # External service integrations
├── types/          # TypeScript type definitions
├── utils/          # Utility functions
└── App.tsx         # Main application component
```

### Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

### Key Technologies
- **React** - UI framework
- **TypeScript** - Type safety
- **Konva.js** - Canvas rendering with React-Konva
- **Vite** - Build tool and dev server
- **Vitest** - Testing framework
- **Google Drive API** - Cloud storage integration

## Configuration

### Environment Variables
Create a `.env` file in the root directory:

```env
VITE_GOOGLE_CLIENT_ID=your-google-client-id
VITE_GOOGLE_API_KEY=your-google-api-key
```

To get Google API credentials:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google Drive API
4. Create OAuth 2.0 credentials
5. Add authorized JavaScript origins and redirect URIs

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built with React and Konva.js
- Icons and UI inspired by modern design tools
- Measurement tool inspired by CAD software

---

Made with ❤️ by Scott Silver