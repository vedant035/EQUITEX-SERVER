**Professional Equity Analysis Terminal**

EQUITEX is a highly advanced, zero-dependency equity analysis terminal featuring a Bloomberg Dark Terminal theme. 
It combines real-time technical analysis, quantitative statistical forecasting, and AI-powered insights into a single, cohesive interface.  
✨ Core Features🤖 AI-Powered Synthesis: Integrates with the Anthropic Claude API (claude-sonnet-4-6) to generate structured research notes, including Bull Cases, Bear Cases, Industry context, and full investment theses.  
📈 Advanced Charting Engine: Features a custom HTML5 Canvas renderer with DPI scaling, candlestick charts, and volume bars.  
📐 Technical Overlays & Sub-charts: Supports Moving Averages (20/50/200), Bollinger Bands, Fibonacci Retracement, RSI, MACD, Stochastic, Stochastic RSI, and OBV.  
🧮 ARIMA Forecasting: Includes a custom math engine utilizing Gaussian elimination and Yule-Walker AR parameter estimation to generate 45-day forward statistical predictions with 80% and 95% confidence intervals.  
🌍 Global Market Earth Model: Features an interactive global equity map rendering regional market snapshots on an animated HTML5 canvas earth.  
📊 Comprehensive Data Layer: Simulates deterministic OHLCV market data for over 65 assets (Equities, ETFs, Crypto, Indices) using a seeded PRNG.  
🔔 Watchlists & Alerts: Allows users to maintain custom watchlists and configure price-target alert notifications.  
📥 Export Capabilities: Users can download charts directly as PNG files or generate full-text investment research reports.  
📰 Live News Feed: Provides a simulated news and market intelligence feed with sentiment classification (Bull/Bear/Neutral).  

🏗️ Architecture & ModulesThe terminal is built entirely with Vanilla HTML, CSS, and JavaScript, strictly categorized into specific modules: 
 ModuleNameDescriptionCP-1ARIMAMath engine for statistical time-series prediction.  
   CP-2DATASeed definitions, deterministic PRNG data generation, and technical indicator calculations.  
   CP-3CHARTCanvas rendering engine for main candlestick charts, overlays, and sub-charts.  
   CP-4CLAUDE_AIAnthropic API integration for contextual AI analysis.  
   CP-5NEWSSimulated macro and ticker-specific news feed generation.  
   CP-6APPCore controller managing UI wiring, state, export logic, and the global earth terminal.  
 Layout: CSS Grid-based application shell dividing the top bar, sidebar, main chart, and right tab panel.  

🎨 Design SystemThe UI is powered by a robust CSS custom property token system mapping backgrounds, semantic colors (bull/bear/warn), and typography.
🚀 Getting Started because EQUITEX operates with zero external JS dependencies, running the project is incredibly simple:Ensure equitex.html, equitex.css, and equitex.js are in the same directory. Open equitex.html in any modern web browser.  

**⚠️ DisclaimerSimulated market data only. Not financial advice. This project is strictly an educational demonstration.  **
Author: Vedant Nayyar 
