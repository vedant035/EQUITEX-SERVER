/**
 * ═══════════════════════════════════════════════════════════
 *  EQUITEX TERMINAL  ·  equitex.js
 *  Professional Equity Analysis Terminal — JavaScript Core
 * ───────────────────────────────────────────────────────────
 *  Author  : Vedant Nayyar 
 *  Version : 3.0
 *
 *  MODULE LOAD ORDER (all auto-registered on window):
 *  ┌─────────────────────────────────────────────────┐
 *  │  CP-1  ARIMA     — Math engine, Yule-Walker AR  │
 *  │  CP-2  DATA      — 65+ tickers, all indicators  │
 *  │  CP-3  CHART     — Canvas renderer, overlays    │
 *  │  CP-4  CLAUDE_AI — Anthropic API integration    │
 *  │  CP-5  NEWS      — Simulated news / sentiment   │
 *  │  CP-6  APP       — Controller, all UI wiring    │
 *  └─────────────────────────────────────────────────┘
 *
 *  ⚠  Simulated data only · Not financial advice
 * ═══════════════════════════════════════════════════════════
 */

/* ═══════════════════════════════════════════════════
   CP-1  ARIMA MATH ENGINE
   ─ Gaussian elimination, ACF computation, AR(p) fitting
   ─ ARIMA(p,d,q) with Yule-Walker parameter estimation
   ─ 45-day ahead forecasts with 80% / 95% CI bands
════════════════════════════════════════════════════ */
function gaussElim(A,b){
  const n=A.length;if(!n)return[];
  const M=A.map((r,i)=>[...r,b[i]]);
  for(let c=0;c<n;c++){
    let mx=c;
    for(let r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[mx][c]))mx=r;
    [M[c],M[mx]]=[M[mx],M[c]];
    const pv=M[c][c];if(Math.abs(pv)<1e-12)continue;
    for(let r=c+1;r<n;r++){const f=M[r][c]/pv;for(let k=c;k<=n;k++)M[r][k]-=f*M[c][k];}
  }
  const x=new Array(n).fill(0);
  for(let i=n-1;i>=0;i--){
    x[i]=M[i][n];
    for(let j=i+1;j<n;j++)x[i]-=M[i][j]*x[j];
    if(Math.abs(M[i][i])>1e-12)x[i]/=M[i][i];
  }
  return x;
}

function calcACF(data,maxLag){
  const n=data.length;
  const mu=data.reduce((a,b)=>a+b,0)/n;
  const variance=data.reduce((s,x)=>s+(x-mu)**2,0)/n;
  if(variance<1e-12)return{acf:new Array(maxLag+1).fill(0),mu};
  const acf=[1];
  for(let lag=1;lag<=maxLag;lag++){
    let sum=0;for(let i=lag;i<n;i++)sum+=(data[i]-mu)*(data[i-lag]-mu);
    acf.push(sum/(n*variance));
  }
  return{acf,mu};
}

function fitARIMA(prices,p=2,d=1,q=1,steps=45){
  const clean=prices.filter(x=>x!=null&&isFinite(x));
  if(clean.length<40)return null;
  let series=[...clean];const anchors=[];
  for(let i=0;i<d;i++){
    anchors.push(series[series.length-1]);
    const next=[];for(let j=1;j<series.length;j++)next.push(series[j]-series[j-1]);
    series=next;
  }
  const pEff=Math.max(1,Math.min(p,Math.floor(series.length/6)));
  const{acf,mu}=calcACF(series,pEff);
  let phi=[];
  try{
    const R=Array.from({length:pEff},(_,i)=>Array.from({length:pEff},(_,j)=>acf[Math.abs(i-j)]));
    phi=gaussElim(R,acf.slice(1,pEff+1));
  }catch{phi=[acf[1]??0.1];}
  phi=phi.map(v=>Math.max(-0.98,Math.min(0.98,isFinite(v)?v:0)));
  const centered=series.map(x=>x-mu);
  const resid=series.map((_,t)=>{
    if(t<pEff)return 0;
    let ar=0;for(let i=0;i<pEff;i++)ar+=phi[i]*(centered[t-1-i]??0);
    return centered[t]-ar;
  });
  const validResid=resid.slice(pEff);
  const{acf:racf}=calcACF(validResid,Math.max(q,1));
  const theta=q>0?racf.slice(1,q+1).map(v=>Math.max(-0.8,Math.min(0.8,isFinite(v)?v:0))):[];
  const rmse=Math.sqrt(validResid.reduce((s,r)=>s+r*r,0)/Math.max(1,validResid.length));
  const extC=[...centered],extR=[...resid],diffFc=[];
  for(let h=0;h<steps;h++){
    let ar=0,ma=0;
    for(let i=0;i<pEff;i++)ar+=phi[i]*(extC[extC.length-1-i]??0);
    for(let i=0;i<theta.length;i++)ma+=theta[i]*(extR[extR.length-1-i]??0);
    const fc=mu+ar+ma;extC.push(fc-mu);extR.push(0);diffFc.push(fc);
  }
  let fcSeries=[...diffFc];
  for(let i=d-1;i>=0;i--){let last=anchors[i];fcSeries=fcSeries.map(f=>{last+=f;return last;});}
  const lastPrice=clean[clean.length-1];
  const target30=fcSeries[Math.min(29,steps-1)];
  const changePct=((target30-lastPrice)/lastPrice)*100;
  const forecasts=fcSeries.map((f,h)=>({
    f:+f.toFixed(2),
    hi95:+(f+1.96*rmse*Math.sqrt(h+1)).toFixed(2),
    lo95:+(f-1.96*rmse*Math.sqrt(h+1)).toFixed(2),
    hi80:+(f+1.28*rmse*Math.sqrt(h+1)).toFixed(2),
    lo80:+(f-1.28*rmse*Math.sqrt(h+1)).toFixed(2),
  }));
  return{forecasts,phi,theta,rmse,params:{p:pEff,d,q},lastPrice:+lastPrice.toFixed(2),target30:+target30.toFixed(2),changePct:+changePct.toFixed(2)};
}

window.ARIMA={fitARIMA,calcACF,gaussElim};


/* ═══════════════════════════════════════════════════
   CP-2  DATA LAYER
   ─ 65+ asset seed definitions (price, vol, drift)
   ─ Seeded PRNG for deterministic OHLCV generation
   ─ Full indicator suite: RSI, MACD, BB, MA, OBV,
     Stochastic, Stochastic RSI, Fibonacci series
════════════════════════════════════════════════════ */
const DATA=(()=>{

const SEEDS={
  /* ── Mega-cap Tech ── */
  AAPL:{price:211,vol:0.018,drift:0.0003},
  MSFT:{price:432,vol:0.016,drift:0.0004},
  GOOGL:{price:175,vol:0.019,drift:0.0003},
  AMZN:{price:196,vol:0.021,drift:0.0004},
  NVDA:{price:131,vol:0.035,drift:0.0008},
  META:{price:596,vol:0.024,drift:0.0005},
  TSLA:{price:248,vol:0.042,drift:0.0002},
  NFLX:{price:1072,vol:0.022,drift:0.0003},
  /* ── Mid-cap Tech ── */
  AMD:{price:178,vol:0.038,drift:0.0006},
  INTC:{price:22,vol:0.028,drift:-0.0001},
  CRM:{price:312,vol:0.022,drift:0.0004},
  ORCL:{price:182,vol:0.018,drift:0.0004},
  ADBE:{price:436,vol:0.020,drift:0.0003},
  PLTR:{price:38,vol:0.045,drift:0.0004},
  UBER:{price:82,vol:0.026,drift:0.0003},
  SHOP:{price:115,vol:0.035,drift:0.0003},
  SPOT:{price:485,vol:0.028,drift:0.0004},
  SNAP:{price:12,vol:0.055,drift:-0.0001},
  NET:{price:118,vol:0.038,drift:0.0005},
  DDOG:{price:142,vol:0.040,drift:0.0005},
  /* ── Fintech/Crypto ── */
  PYPL:{price:78,vol:0.030,drift:0.0001},
  COIN:{price:245,vol:0.058,drift:0.0005},
  SQ:{price:74,vol:0.038,drift:0.0003},
  HOOD:{price:42,vol:0.055,drift:0.0003},
  SOFI:{price:14,vol:0.048,drift:0.0002},
  BTC:{price:106000,vol:0.045,drift:0.001},
  ETH:{price:3800,vol:0.042,drift:0.0008},
  SOL:{price:185,vol:0.055,drift:0.0009},
  MSTR:{price:385,vol:0.065,drift:0.0006},
  /* ── Finance ── */
  JPM:{price:254,vol:0.015,drift:0.0003},
  BAC:{price:44,vol:0.019,drift:0.0002},
  GS:{price:582,vol:0.016,drift:0.0003},
  MS:{price:118,vol:0.018,drift:0.0003},
  V:{price:361,vol:0.013,drift:0.0003},
  MA:{price:498,vol:0.014,drift:0.0003},
  /* ── Consumer/Retail ── */
  WMT:{price:103,vol:0.012,drift:0.0002},
  MCD:{price:313,vol:0.013,drift:0.0002},
  KO:{price:71,vol:0.010,drift:0.0001},
  PEP:{price:168,vol:0.011,drift:0.0002},
  NKE:{price:82,vol:0.020,drift:0.0002},
  /* ── Healthcare ── */
  JNJ:{price:152,vol:0.011,drift:0.0001},
  UNH:{price:485,vol:0.015,drift:0.0003},
  ABBV:{price:195,vol:0.016,drift:0.0003},
  PFE:{price:28,vol:0.016,drift:0.0000},
  LLY:{price:845,vol:0.018,drift:0.0005},
  /* ── Energy ── */
  XOM:{price:108,vol:0.020,drift:0.0002},
  CVX:{price:157,vol:0.018,drift:0.0002},
  /* ── Industrial/Macro ── */
  BA:{price:183,vol:0.025,drift:0.0001},
  CAT:{price:378,vol:0.017,drift:0.0003},
  PG:{price:175,vol:0.011,drift:0.0002},
  BRK:{price:524,vol:0.012,drift:0.0002},
  /* ── EV/Clean Energy ── */
  RIVN:{price:13,vol:0.055,drift:0.0001},
  F:{price:11.5,vol:0.025,drift:0.0001},
  GM:{price:52,vol:0.022,drift:0.0002},
  ENPH:{price:78,vol:0.040,drift:0.0001},
  FSLR:{price:162,vol:0.035,drift:0.0003},
  /* ── ETFs ── */
  SPY:{price:585,vol:0.012,drift:0.0003},
  QQQ:{price:504,vol:0.016,drift:0.0004},
  IWM:{price:218,vol:0.016,drift:0.0003},
  DIA:{price:442,vol:0.013,drift:0.0003},
  GLD:{price:315,vol:0.009,drift:0.0001},
  SLV:{price:31,vol:0.012,drift:0.0001},
  TLT:{price:88,vol:0.010,drift:-0.0001},
  /* ── Global/Emerging ── */
  TSM:{price:195,vol:0.022,drift:0.0004},
  BABA:{price:110,vol:0.030,drift:0.0001},
  NIO:{price:4.8,vol:0.060,drift:-0.0001},
};

const NAMES={
  AAPL:'Apple',MSFT:'Microsoft',GOOGL:'Alphabet',AMZN:'Amazon',NVDA:'NVIDIA',
  META:'Meta',TSLA:'Tesla',NFLX:'Netflix',AMD:'AMD',INTC:'Intel',
  CRM:'Salesforce',ORCL:'Oracle',ADBE:'Adobe',PLTR:'Palantir',UBER:'Uber',
  SHOP:'Shopify',SPOT:'Spotify',SNAP:'Snap',NET:'Cloudflare',DDOG:'Datadog',
  PYPL:'PayPal',COIN:'Coinbase',SQ:'Block',HOOD:'Robinhood',SOFI:'SoFi',
  BTC:'Bitcoin',ETH:'Ethereum',SOL:'Solana',MSTR:'MicroStrategy',
  JPM:'JPMorgan',BAC:'Bank of America',GS:'Goldman Sachs',MS:'Morgan Stanley',
  V:'Visa',MA:'Mastercard',WMT:'Walmart',MCD:"McDonald's",KO:'Coca-Cola',
  PEP:'PepsiCo',NKE:'Nike',JNJ:'J&J',UNH:'UnitedHealth',ABBV:'AbbVie',
  PFE:'Pfizer',LLY:'Eli Lilly',XOM:'ExxonMobil',CVX:'Chevron',
  BA:'Boeing',CAT:'Caterpillar',PG:'Procter & Gamble',BRK:'Berkshire',
  RIVN:'Rivian',F:'Ford',GM:'General Motors',ENPH:'Enphase',FSLR:'First Solar',
  SPY:'S&P 500 ETF',QQQ:'Nasdaq 100',IWM:'Russell 2000',DIA:'Dow ETF',
  GLD:'Gold ETF',SLV:'Silver ETF',TLT:'Treasury ETF',
  TSM:'TSMC',BABA:'Alibaba',NIO:'NIO',
};

/* ── Seeded PRNG ── */
function mulberry32(seed){
  return function(){
    seed|=0;seed=seed+0x6D2B79F5|0;
    let t=Math.imul(seed^seed>>>15,1|seed);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return((t^t>>>14)>>>0)/4294967296;
  };
}
function strHash(s){let h=5381;for(let i=0;i<s.length;i++)h=(h*33^s.charCodeAt(i))>>>0;return h;}
function boxMuller(rand){const u=1-rand(),v=rand();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}

/* ── OHLCV generator ── */
function generateMockOHLCV(ticker,days=365){
  const sym=ticker.toUpperCase();
  const seed=SEEDS[sym]||{price:100,vol:0.02,drift:0.0002};
  const rand=mulberry32(strHash(sym));
  const closes=[seed.price];
  for(let i=1;i<days;i++){
    const r=seed.drift+seed.vol*boxMuller(rand);
    closes.push(+(closes[i-1]*Math.exp(r)).toFixed(2));
  }
  return closes.map((close,i)=>{
    const prev=i>0?closes[i-1]:close;
    const range=close*seed.vol*(0.5+rand()*1.5);
    const open=+(prev*(1+(rand()-0.5)*seed.vol*0.5)).toFixed(2);
    const high=+(Math.max(open,close)+range*rand()).toFixed(2);
    const low=+(Math.min(open,close)-range*rand()).toFixed(2);
    const vol=Math.round(5e6+rand()*20e6);
    const date=new Date(Date.now()-(days-i)*86400000);
    return{date:date.toISOString().slice(0,10),open,high,low,close,vol};
  });
}

/* ── Indicators ── */
function ema(arr,period){
  const k=2/(period+1);const result=[arr[0]];
  for(let i=1;i<arr.length;i++)result.push(arr[i]*k+result[i-1]*(1-k));
  return result;
}
function sma(arr,period){
  return arr.map((_,i)=>{
    if(i<period-1)return null;
    const sl=arr.slice(i-period+1,i+1).filter(v=>v!=null);
    return sl.reduce((a,b)=>a+b,0)/sl.length;
  });
}
function computeRSI(closes,period=14){
  const changes=closes.map((c,i)=>i===0?0:c-closes[i-1]);
  const gains=changes.map(c=>Math.max(0,c));
  const losses=changes.map(c=>Math.max(0,-c));
  const rsi=new Array(period).fill(null);
  let avgG=gains.slice(1,period+1).reduce((a,b)=>a+b)/period;
  let avgL=losses.slice(1,period+1).reduce((a,b)=>a+b)/period;
  for(let i=period;i<closes.length;i++){
    avgG=(avgG*(period-1)+gains[i])/period;
    avgL=(avgL*(period-1)+losses[i])/period;
    const rs=avgL===0?100:avgG/avgL;
    rsi.push(+(100-100/(1+rs)).toFixed(2));
  }
  return rsi;
}
function computeMACD(closes){
  const e12=ema(closes,12),e26=ema(closes,26);
  const macd=e12.map((v,i)=>+(v-e26[i]).toFixed(4));
  const signal=ema(macd,9);
  const hist=macd.map((v,i)=>+(v-signal[i]).toFixed(4));
  return{macd,signal,hist};
}
function computeBB(closes,period=20,mult=2){
  const mid=sma(closes,period);
  return mid.map((m,i)=>{
    if(m===null)return{upper:null,mid:null,lower:null};
    const sl=closes.slice(i-period+1,i+1);
    const std=Math.sqrt(sl.reduce((s,x)=>s+(x-m)**2,0)/period);
    return{upper:+(m+mult*std).toFixed(2),mid:+m.toFixed(2),lower:+(m-mult*std).toFixed(2)};
  });
}
function computeStochastic(bars,period=14,smoothK=3,smoothD=3){
  const rawKs=bars.map((_,i)=>{
    if(i<period-1)return null;
    const sl=bars.slice(i-period+1,i+1);
    const hh=Math.max(...sl.map(b=>b.high));
    const ll=Math.min(...sl.map(b=>b.low));
    return hh===ll?50:((bars[i].close-ll)/(hh-ll))*100;
  });
  const kLine=sma(rawKs,smoothK);
  const dLine=sma(kLine,smoothD);
  return bars.map((_,i)=>({k:kLine[i],d:dLine[i]}));
}
function computeStochRSI(rsiSeries,period=14,smoothK=3,smoothD=3){
  const stochRaw=rsiSeries.map((v,i)=>{
    if(v===null||i<period-1)return null;
    const sl=rsiSeries.slice(i-period+1,i+1).filter(x=>x!=null);
    const hh=Math.max(...sl),ll=Math.min(...sl);
    return hh===ll?0:((v-ll)/(hh-ll))*100;
  });
  const kLine=sma(stochRaw,smoothK);
  const dLine=sma(kLine,smoothD);
  return stochRaw.map((_,i)=>({k:kLine[i],d:dLine[i]}));
}
function computeOBV(closes,volumes){
  const obv=[0];
  for(let i=1;i<closes.length;i++){
    if(closes[i]>closes[i-1])obv.push(obv[i-1]+volumes[i]);
    else if(closes[i]<closes[i-1])obv.push(obv[i-1]-volumes[i]);
    else obv.push(obv[i-1]);
  }
  return obv;
}

/* ── Public API ── */
function getQuote(ticker){
  const bars=generateMockOHLCV(ticker,365);
  const closes=bars.map(b=>b.close);
  const vols=bars.map(b=>b.vol);
  const last=closes[closes.length-1];
  const prev=closes[closes.length-2];
  const change=+(last-prev).toFixed(2);
  const changePct=+((change/prev)*100).toFixed(2);
  const high52=Math.max(...closes.slice(-252));
  const low52=Math.min(...closes.slice(-252));
  const avgVol=Math.round(bars.slice(-20).reduce((s,b)=>s+b.vol,0)/20);
  const seed=SEEDS[ticker.toUpperCase()]||{price:100};
  const mktCap=+(last*(seed.price>1000?1e6:seed.price>100?5e8:2e9)*(5+Math.abs(strHash(ticker)%15))).toFixed(0);
  const rsiSeries=computeRSI(closes);
  const macdData=computeMACD(closes);
  const bbSeries=computeBB(closes);
  const ma20Series=sma(closes,20);
  const ma50Series=sma(closes,50);
  const ma200Series=sma(closes,200);
  const stochSeries=computeStochastic(bars);
  const stochRSISeries=computeStochRSI(rsiSeries);
  const obvSeries=computeOBV(closes,vols);
  return{
    ticker:ticker.toUpperCase(),
    name:NAMES[ticker.toUpperCase()]||ticker.toUpperCase(),
    last,change,changePct,high52,low52,avgVol,mktCap,bars,closes,
    indicators:{
      rsi:rsiSeries[rsiSeries.length-1],rsiSeries,
      macd:macdData.macd[macdData.macd.length-1],
      signal:macdData.signal[macdData.signal.length-1],
      hist:macdData.hist[macdData.hist.length-1],
      macdSeries:macdData,bbSeries,
      bb:bbSeries[bbSeries.length-1],
      ma20:ma20Series[ma20Series.length-1],
      ma50:ma50Series[ma50Series.length-1],
      ma200:ma200Series[ma200Series.length-1],
      ma20Series,ma50Series,ma200Series,
      stochSeries,stochRSISeries,obvSeries,
      obv:obvSeries[obvSeries.length-1],
    },
  };
}
function getWatchlist(tickers){
  return tickers.map(t=>{const q=getQuote(t);return{ticker:q.ticker,name:q.name,last:q.last,change:q.change,changePct:q.changePct,high52:q.high52,low52:q.low52,rsi:q.indicators.rsi};});
}
return{getQuote,getWatchlist,NAMES,SEEDS};
})();
window.DATA=DATA;


/* ═══════════════════════════════════════════════════
   CP-3  CHART ENGINE
   ─ HTML5 Canvas renderer with DPI scaling
   ─ Candlestick + OHLCV volume bars
   ─ Overlays: MA20/50/200, Bollinger Bands, ARIMA,
     Fibonacci Retracement levels (7 levels)
   ─ Sub-charts: RSI, MACD, Stochastic, StochRSI, OBV
════════════════════════════════════════════════════ */
const CHART=(()=>{
const C={
  bull:'#00e5a0',bear:'#ff4560',grid:'rgba(255,255,255,0.05)',
  axis:'rgba(255,255,255,0.25)',label:'rgba(255,255,255,0.45)',
  ma20:'#f5c518',ma50:'#3b82f6',ma200:'#a855f7',
  bbUpper:'rgba(148,163,184,0.4)',bbLower:'rgba(148,163,184,0.4)',bbMid:'rgba(148,163,184,0.2)',
  forecast:'#00e5a0',band95:'rgba(0,229,160,0.07)',band80:'rgba(0,229,160,0.13)',
  volBull:'rgba(0,229,160,0.22)',volBear:'rgba(255,69,96,0.22)',
  obv:'#a855f7',stochK:'#f5c518',stochD:'#3b82f6',
  fib:['rgba(0,229,160,0.4)','rgba(245,158,11,0.55)','rgba(245,158,11,0.55)','rgba(148,163,184,0.5)','rgba(59,130,246,0.55)','rgba(168,85,247,0.55)','rgba(255,69,96,0.4)'],
};
const PAD={top:22,right:68,bottom:28,left:10};
const VOL_R=0.18;

function scale(domain,range){
  const[dMin,dMax]=domain,[rMin,rMax]=range,span=dMax-dMin||1;
  return v=>rMin+((v-dMin)/span)*(rMax-rMin);
}
function drawLine(ctx,xs,ys,color,lw=1.5,dash=[]){
  ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.setLineDash(dash);
  ctx.beginPath();let started=false;
  for(let i=0;i<xs.length;i++){if(ys[i]==null)continue;started?ctx.lineTo(xs[i],ys[i]):(ctx.moveTo(xs[i],ys[i]),started=true);}
  ctx.stroke();ctx.setLineDash([]);
}
function drawBand(ctx,xs,upper,lower,fill){
  ctx.fillStyle=fill;ctx.beginPath();
  let s=false;for(let i=0;i<xs.length;i++){if(upper[i]==null)continue;s?ctx.lineTo(xs[i],upper[i]):(ctx.moveTo(xs[i],upper[i]),s=true);}
  for(let i=xs.length-1;i>=0;i--){if(lower[i]==null)continue;ctx.lineTo(xs[i],lower[i]);}
  ctx.closePath();ctx.fill();
}
function drawCandle(ctx,x,cw,bar,yS){
  const bull=bar.close>=bar.open;
  ctx.strokeStyle=bull?C.bull:C.bear;ctx.fillStyle=bull?C.bull:C.bear;
  const yH=yS(bar.high),yL=yS(bar.low),yO=yS(bar.open),yC=yS(bar.close);
  const bH=Math.abs(yC-yO)||1;
  ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,yH);ctx.lineTo(x,Math.min(yO,yC));ctx.stroke();
  ctx.beginPath();ctx.moveTo(x,Math.max(yO,yC));ctx.lineTo(x,yL);ctx.stroke();
  if(bull){ctx.strokeRect(x-cw/2,yC,cw,bH);}
  else{ctx.fillRect(x-cw/2,yC,cw,bH);}
}
function drawGrid(ctx,CW,CH,yS,pMin,pMax,bars,plotTop,plotBottom,plotLeft,plotRight){
  ctx.font='10px "JetBrains Mono",monospace';
  for(let i=0;i<=6;i++){
    const price=pMin+(pMax-pMin)*(i/6);const y=yS(price);
    ctx.strokeStyle=C.grid;ctx.lineWidth=1;ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.moveTo(plotLeft,y);ctx.lineTo(plotRight,y);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=C.label;ctx.textAlign='left';
    ctx.fillText(price>=1000?price.toFixed(0):price.toFixed(2),plotRight+4,y+4);
  }
  const step=Math.max(1,Math.floor(bars.length/Math.floor((plotRight-plotLeft)/55)));
  ctx.fillStyle=C.label;ctx.textAlign='center';
  for(let i=0;i<bars.length;i+=step){
    const x=plotLeft+(i/(bars.length-1))*(plotRight-plotLeft);
    const d=new Date(bars[i].date);
    ctx.fillText(`${d.toLocaleString('default',{month:'short'})} ${d.getDate()}`,x,CH-6);
  }
}
function drawFibonacci(ctx,bars,yS,plotLeft,plotRight,plotTop,plotBottom,CW){
  const hh=Math.max(...bars.map(b=>b.high)),ll=Math.min(...bars.map(b=>b.low));
  const levels=[0,0.236,0.382,0.5,0.618,0.786,1.0];
  const labels=['0','23.6%','38.2%','50%','61.8%','78.6%','100%'];
  ctx.font='9px "JetBrains Mono",monospace';
  levels.forEach((lvl,i)=>{
    const price=ll+(hh-ll)*(1-lvl);const y=yS(price);
    ctx.strokeStyle=C.fib[i];ctx.lineWidth=1;ctx.setLineDash([3,4]);
    ctx.beginPath();ctx.moveTo(plotLeft,y);ctx.lineTo(plotRight,y);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=C.fib[i];ctx.textAlign='right';
    ctx.fillText(`${labels[i]} ${price>=100?price.toFixed(1):price.toFixed(2)}`,plotRight-4,y-2);
  });
}

/* ── Main render ── */
function render(canvas,quote,opts={}){
  const{showMA=true,showBB=false,showVol=true,showArima=false,showFib=false,arimaRes=null,range=120}=opts;
  const dpr=window.devicePixelRatio||1;
  canvas.width=canvas.offsetWidth*dpr;canvas.height=canvas.offsetHeight*dpr;
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  const CW=canvas.offsetWidth,CH=canvas.offsetHeight;
  ctx.clearRect(0,0,CW,CH);
  const bars=quote.bars.slice(-range);
  let pMin=Math.min(...bars.map(b=>b.low)),pMax=Math.max(...bars.map(b=>b.high));
  if(showArima&&arimaRes){pMax=Math.max(pMax,...arimaRes.forecasts.map(f=>f.hi95));pMin=Math.min(pMin,...arimaRes.forecasts.map(f=>f.lo95));}
  const pad=(pMax-pMin)*0.05;pMin-=pad;pMax+=pad;
  const volH=showVol?CH*VOL_R:0,chartH=CH-volH;
  const pTop=PAD.top,pBottom=chartH-PAD.bottom;
  const pLeft=PAD.left,pRight=CW-PAD.right,pW=pRight-pLeft;
  const yS=scale([pMin,pMax],[pBottom,pTop]);
  const totalBars=showArima&&arimaRes?bars.length+arimaRes.forecasts.length:bars.length;
  const cw=Math.max(2,Math.floor(pW/totalBars*0.75));
  const xOf=i=>pLeft+(i/(totalBars-1))*pW;
  drawGrid(ctx,CW,CH,yS,pMin,pMax,bars,pTop,pBottom,pLeft,pRight);
  if(showVol){
    const vMax=Math.max(...bars.map(b=>b.vol));
    const vTop=chartH+4,vBot=CH-4,yV=scale([0,vMax],[vBot,vTop]);
    bars.forEach((bar,i)=>{
      ctx.fillStyle=bar.close>=bar.open?C.volBull:C.volBear;
      const y=yV(bar.vol);ctx.fillRect(xOf(i)-cw/2,y,cw,vBot-y);
    });
  }
  if(showFib)drawFibonacci(ctx,bars,yS,pLeft,pRight,pTop,pBottom,CW);
  if(showBB){
    const s=quote.closes.length-range;const bbs=quote.indicators.bbSeries.slice(s);
    const xs=bars.map((_,i)=>xOf(i));
    drawBand(ctx,xs,bbs.map(b=>b?.upper!=null?yS(b.upper):null),bbs.map(b=>b?.lower!=null?yS(b.lower):null),'rgba(148,163,184,0.05)');
    drawLine(ctx,xs,bbs.map(b=>b?.upper!=null?yS(b.upper):null),C.bbUpper,1,[3,3]);
    drawLine(ctx,xs,bbs.map(b=>b?.lower!=null?yS(b.lower):null),C.bbLower,1,[3,3]);
    drawLine(ctx,xs,bbs.map(b=>b?.mid!=null?yS(b.mid):null),C.bbMid,1,[2,4]);
  }
  if(showMA){
    const s=quote.closes.length-range;
    [[quote.indicators.ma20Series,C.ma20,1.2],[quote.indicators.ma50Series,C.ma50,1.5],[quote.indicators.ma200Series,C.ma200,1.8]].forEach(([ser,col,w])=>{
      const sl=ser.slice(s);drawLine(ctx,sl.map((_,i)=>xOf(i)),sl.map(v=>v!=null?yS(v):null),col,w);
    });
  }
  if(showArima&&arimaRes){
    const fcs=arimaRes.forecasts,off=bars.length;
    const xs=fcs.map((_,i)=>xOf(off+i));
    const lastX=xOf(bars.length-1),lastY=yS(bars[bars.length-1].close);
    ctx.strokeStyle=C.forecast;ctx.lineWidth=1;ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.moveTo(lastX,lastY);ctx.lineTo(xs[0],yS(fcs[0].f));ctx.stroke();ctx.setLineDash([]);
    drawBand(ctx,xs,fcs.map(f=>yS(f.hi95)),fcs.map(f=>yS(f.lo95)),C.band95);
    drawBand(ctx,xs,fcs.map(f=>yS(f.hi80)),fcs.map(f=>yS(f.lo80)),C.band80);
    drawLine(ctx,xs,fcs.map(f=>yS(f.f)),C.forecast,2);
    ctx.strokeStyle='rgba(0,229,160,0.25)';ctx.lineWidth=1;ctx.setLineDash([6,3]);
    ctx.beginPath();ctx.moveTo(lastX,pTop);ctx.lineTo(lastX,pBottom);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='rgba(0,229,160,0.5)';ctx.font='9px "JetBrains Mono",monospace';ctx.textAlign='center';
    ctx.fillText('FORECAST',lastX+(xs[xs.length-1]-lastX)/2,pTop+13);
  }
  bars.forEach((bar,i)=>drawCandle(ctx,xOf(i),cw,bar,yS));
  ctx.strokeStyle=C.axis;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pLeft,pTop);ctx.lineTo(pLeft,pBottom);ctx.stroke();
  return{xOf,yS,bars,pTop,pBottom,pLeft,pRight};
}

/* ── RSI sub-chart ── */
function renderRSI(canvas,rsiSeries,range=120){
  const dpr=window.devicePixelRatio||1;
  canvas.width=canvas.offsetWidth*dpr;canvas.height=canvas.offsetHeight*dpr;
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  const CW=canvas.offsetWidth,CH=canvas.offsetHeight;
  ctx.clearRect(0,0,CW,CH);
  const slice=rsiSeries.slice(-range).filter(v=>v!=null);
  const pW=CW-PAD.left-PAD.right,pH=CH-8;
  const yS=scale([0,100],[pH,4]);
  const xOf=i=>PAD.left+(i/(slice.length-1))*pW;
  [70,30].forEach(lvl=>{
    const y=yS(lvl);ctx.strokeStyle='rgba(255,255,255,0.1)';ctx.lineWidth=1;ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.moveTo(PAD.left,y);ctx.lineTo(CW-PAD.right,y);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=C.label;ctx.font='9px "JetBrains Mono",monospace';ctx.textAlign='left';
    ctx.fillText(lvl,CW-PAD.right+4,y+4);
  });
  const xs=slice.map((_,i)=>xOf(i)),ys=slice.map(v=>yS(v));
  for(let i=1;i<xs.length;i++){
    ctx.strokeStyle=slice[i]>70?C.bear:slice[i]<30?C.bull:'rgba(148,163,184,0.7)';
    ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(xs[i-1],ys[i-1]);ctx.lineTo(xs[i],ys[i]);ctx.stroke();
  }
  const cur=slice[slice.length-1];
  ctx.fillStyle=cur>70?C.bear:cur<30?C.bull:C.label;ctx.font='10px "JetBrains Mono",monospace';ctx.textAlign='right';
  ctx.fillText(`RSI ${cur?.toFixed(1)}`,CW-PAD.right-2,12);
}

/* ── MACD sub-chart ── */
function renderMACD(canvas,macdData,range=120){
  const dpr=window.devicePixelRatio||1;
  canvas.width=canvas.offsetWidth*dpr;canvas.height=canvas.offsetHeight*dpr;
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  const CW=canvas.offsetWidth,CH=canvas.offsetHeight;
  ctx.clearRect(0,0,CW,CH);
  const{macd,signal,hist}=macdData;
  const mS=macd.slice(-range),sS=signal.slice(-range),hS=hist.slice(-range);
  const all=[...mS,...sS,...hS].filter(v=>isFinite(v));
  const vMin=Math.min(...all),vMax=Math.max(...all);
  const pW=CW-PAD.left-PAD.right,pH=CH-8;
  const yS=scale([vMin,vMax],[pH,4]);
  const xOf=i=>PAD.left+(i/(mS.length-1))*pW;
  const cw=Math.max(2,Math.floor(pW/mS.length*0.7));
  const yZ=yS(0);
  ctx.strokeStyle='rgba(255,255,255,0.1)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(PAD.left,yZ);ctx.lineTo(CW-PAD.right,yZ);ctx.stroke();
  hS.forEach((v,i)=>{
    ctx.fillStyle=v>=0?'rgba(0,229,160,0.5)':'rgba(255,69,96,0.5)';
    const y=yS(v),h=Math.abs(y-yZ);ctx.fillRect(xOf(i)-cw/2,Math.min(y,yZ),cw,h||1);
  });
  const xs=mS.map((_,i)=>xOf(i));
  drawLine(ctx,xs,mS.map(v=>yS(v)),C.ma20,1.5);
  drawLine(ctx,xs,sS.map(v=>yS(v)),C.ma50,1.5);
  ctx.fillStyle=C.label;ctx.font='9px "JetBrains Mono",monospace';ctx.textAlign='right';
  ctx.fillText('MACD',CW-PAD.right-2,12);
}

/* ── Stochastic sub-chart ── */
function renderStoch(canvas,stochSeries,range=120,label='STOCH'){
  const dpr=window.devicePixelRatio||1;
  canvas.width=canvas.offsetWidth*dpr;canvas.height=canvas.offsetHeight*dpr;
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  const CW=canvas.offsetWidth,CH=canvas.offsetHeight;
  ctx.clearRect(0,0,CW,CH);
  const slice=stochSeries.slice(-range);
  const pW=CW-PAD.left-PAD.right,pH=CH-8;
  const yS=scale([0,100],[pH,4]);
  const xOf=i=>PAD.left+(i/(slice.length-1))*pW;
  [80,20].forEach(lvl=>{
    const y=yS(lvl);ctx.strokeStyle='rgba(255,255,255,0.1)';ctx.lineWidth=1;ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.moveTo(PAD.left,y);ctx.lineTo(CW-PAD.right,y);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=C.label;ctx.font='9px "JetBrains Mono",monospace';ctx.textAlign='left';
    ctx.fillText(lvl,CW-PAD.right+4,y+4);
  });
  const ks=slice.map(s=>s?.k),ds=slice.map(s=>s?.d);
  const xs=slice.map((_,i)=>xOf(i));
  drawLine(ctx,xs,ks.map(v=>v!=null?yS(v):null),C.stochK,1.5);
  drawLine(ctx,xs,ds.map(v=>v!=null?yS(v):null),C.stochD,1.5,[4,2]);
  const curK=ks.filter(v=>v!=null).pop();
  ctx.fillStyle=C.label;ctx.font='10px "JetBrains Mono",monospace';ctx.textAlign='right';
  ctx.fillText(`${label} %K ${curK?.toFixed(1)}`,CW-PAD.right-2,12);
}

/* ── OBV sub-chart ── */
function renderOBV(canvas,obvSeries,range=120){
  const dpr=window.devicePixelRatio||1;
  canvas.width=canvas.offsetWidth*dpr;canvas.height=canvas.offsetHeight*dpr;
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  const CW=canvas.offsetWidth,CH=canvas.offsetHeight;
  ctx.clearRect(0,0,CW,CH);
  const slice=obvSeries.slice(-range);
  const pW=CW-PAD.left-PAD.right,pH=CH-8;
  const vMin=Math.min(...slice),vMax=Math.max(...slice);
  const yS=scale([vMin,vMax],[pH,4]);
  const xOf=i=>PAD.left+(i/(slice.length-1))*pW;
  ctx.strokeStyle='rgba(255,255,255,0.05)';ctx.lineWidth=1;ctx.setLineDash([4,4]);
  ctx.beginPath();const midV=(vMin+vMax)/2;const midY=yS(midV);
  ctx.moveTo(PAD.left,midY);ctx.lineTo(CW-PAD.right,midY);ctx.stroke();ctx.setLineDash([]);
  // Fill gradient
  const grad=ctx.createLinearGradient(0,4,0,pH);
  grad.addColorStop(0,'rgba(168,85,247,0.3)');grad.addColorStop(1,'rgba(168,85,247,0)');
  ctx.fillStyle=grad;ctx.beginPath();
  const xs=slice.map((_,i)=>xOf(i));
  ctx.moveTo(xs[0],yS(slice[0]));
  for(let i=1;i<xs.length;i++)ctx.lineTo(xs[i],yS(slice[i]));
  ctx.lineTo(xs[xs.length-1],pH);ctx.lineTo(xs[0],pH);ctx.closePath();ctx.fill();
  drawLine(ctx,xs,slice.map(v=>yS(v)),C.obv,1.5);
  const fmt=v=>v>=1e9?(v/1e9).toFixed(1)+'B':v>=1e6?(v/1e6).toFixed(1)+'M':(v/1e3).toFixed(0)+'K';
  ctx.fillStyle=C.label;ctx.font='10px "JetBrains Mono",monospace';ctx.textAlign='right';
  ctx.fillText(`OBV ${fmt(slice[slice.length-1])}`,CW-PAD.right-2,12);
}

return{render,renderRSI,renderMACD,renderStoch,renderOBV,C};
})();
window.CHART=CHART;


/* ═══════════════════════════════════════════════════
   CP-4  CLAUDE AI MODULE
   ─ Calls api.anthropic.com/v1/messages (claude-sonnet-4-6)
   ─ Modes: Bull Case, Bear Case, Industry, Thesis
   ─ Passes live RSI/MACD/MA/52W data as context
   ─ Auth handled by Claude.ai proxy (no key in code)
════════════════════════════════════════════════════ */
const CLAUDE_AI=(()=>{
const PROMPTS={
  bull:(t,d)=>`Bull case for ${t}: Price $${d.price}, Day change ${d.change}%, RSI(14)=${d.rsi}, MACD hist=${d.macdH}, vs MA50=$${d.ma50}, vs MA200=$${d.ma200}, 52W range $${d.low52}–$${d.high52}, Mkt Cap ${d.cap}. Write a 3–4 sentence bull case thesis from the perspective of a long-only equity analyst. Be specific about catalysts and valuation support. No bullet points.`,
  bear:(t,d)=>`Bear case for ${t}: Price $${d.price}, Day change ${d.change}%, RSI(14)=${d.rsi}, MACD hist=${d.macdH}, vs MA50=$${d.ma50}, vs MA200=$${d.ma200}, 52W range $${d.low52}–$${d.high52}, Mkt Cap ${d.cap}. Write a 3–4 sentence bear case using Charlie Munger's inversion approach. Focus on structural risks and downside catalysts. No bullet points.`,
  industry:(t,d)=>`Industry and competitive context for ${t}: Price $${d.price}, RSI=${d.rsi}, 52W range $${d.low52}–$${d.high52}, Mkt Cap ${d.cap}. Write 3–4 sentences on the sector landscape, competitive moat, and macro tailwinds or headwinds affecting this company. Be analytical. No bullet points.`,
  thesis:(t,d)=>`Full investment thesis for ${t}: Price $${d.price}, Change ${d.change}%, RSI=${d.rsi}, MACD hist=${d.macdH}, MA50=$${d.ma50}, MA200=$${d.ma200}, 52W range $${d.low52}–$${d.high52}, Mkt Cap ${d.cap}. Write a 4–5 sentence balanced research note in the style of a Goldman Sachs initiation report. Cover key drivers, key risks, and one primary catalyst to watch. No bullet points.`,
};
const MODES={
  bull:{label:'▲ BULL CASE',color:'var(--bull)'},
  bear:{label:'▼ BEAR CASE',color:'var(--bear)'},
  industry:{label:'◈ INDUSTRY',color:'var(--accent2)'},
  thesis:{label:'✦ THESIS',color:'var(--orange)'},
};

async function analyze(ticker,quote,mode){
  const ind=quote.indicators;
  const cap=quote.mktCap>=1e12?(quote.mktCap/1e12).toFixed(2)+'T':quote.mktCap>=1e9?(quote.mktCap/1e9).toFixed(1)+'B':(quote.mktCap/1e6).toFixed(0)+'M';
  const d={
    price:quote.last.toFixed(2),
    change:quote.changePct.toFixed(2),
    rsi:ind.rsi?.toFixed(1)||'N/A',
    macdH:ind.hist?.toFixed(3)||'N/A',
    ma50:ind.ma50?.toFixed(2)||'N/A',
    ma200:ind.ma200?.toFixed(2)||'N/A',
    high52:quote.high52.toFixed(2),
    low52:quote.low52.toFixed(2),
    cap,
  };
  const resp=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      model:'claude-sonnet-4-6',
      max_tokens:1000,
      system:'You are a senior equity research analyst at a top-tier investment bank. Provide sharp, data-driven analysis in professional prose. Be specific and concise. No headers, no bullet points, no markdown formatting.',
      messages:[{role:'user',content:PROMPTS[mode](ticker,d)}],
    }),
  });
  if(!resp.ok)throw new Error(`HTTP ${resp.status}`);
  const data=await resp.json();
  return data.content?.[0]?.text||'Analysis unavailable.';
}

return{analyze,MODES};
})();
window.CLAUDE_AI=CLAUDE_AI;


/* ═══════════════════════════════════════════════════
   CP-5  NEWS MODULE
   ─ Simulated news feed with sentiment classification
   ─ Templates respond to RSI levels and day direction
   ─ 7 items per load (3 ticker-specific + 4 macro)
════════════════════════════════════════════════════ */
const NEWS=(()=>{
const SOURCES=['Reuters','Bloomberg','WSJ','CNBC','Barron\'s','FT','Seeking Alpha'];
const BULL=[
  '{s} breaks above key technical resistance on elevated volume',
  'Analysts raise {s} price target citing strong fundamental backdrop',
  '{s} gains institutional accumulation ahead of catalyst-rich period',
  'Goldman Sachs upgrades {s} to Conviction Buy, sees significant upside',
  '{s} CEO signals accelerating growth in private investor briefing',
  'Insider buying at {s} reaches highest level in 18 months',
  '{s} market share gains accelerating, KeyBanc says Buy',
  'Technical setup favors {s} bulls — golden cross forming on daily chart',
];
const BEAR=[
  '{s} short interest hits 12-month high as bears pile in',
  'Regulatory concerns cloud {s} near-term earnings visibility',
  '{s} Q guidance misses consensus; shares slide on thin volume',
  'Morgan Stanley cuts {s} to Underweight on deteriorating margin outlook',
  'Competitive pressure intensifying at {s}, analysts reduce estimates',
  '{s} breaks below 200-day moving average — technicals deteriorate',
  'Options flow signals large put positioning against {s}',
  'Insider selling at {s} raises flags ahead of lock-up expiry',
];
const NEUT=[
  '{s} trading sideways ahead of upcoming earnings catalyst',
  'Analysts split on {s} valuation — consensus holds at Hold',
  '{s} investor day scheduled; strategic update expected',
  '{s} board approves $1.5B share buyback program',
  '{s} CFO presenting at Bernstein Strategic Decisions Conference',
  'Options implied volatility elevated for {s} into print',
];
const MACRO=[
  'Fed officials maintain hawkish tone; rate cut timeline pushed back',
  'CPI surprise triggers broad equity selloff, tech leads decline',
  'AI infrastructure spending cycle shows no signs of cooling',
  'Treasury yields rise on strong jobs data, pressuring growth stocks',
  'Earnings season tracking above estimates, S&P 500 guidance improving',
  'China PMI disappoints, weighing on global risk appetite',
  'Dollar strength complicates multinational revenue outlooks this quarter',
  'Bank stress tests pass, sector buyback capacity expands significantly',
];
function rnd(arr){return arr[Math.floor(Math.random()*arr.length)];}
function getNews(ticker,quote){
  const bull=quote.changePct>0.2||quote.indicators.rsi<40;
  const items=[];
  for(let i=0;i<3;i++){
    const pool=(i===0&&bull)?BULL:(i===0)?BEAR:NEUT;
    const t=rnd(pool).replace(/{s}/g,ticker);
    const sent=(pool===BULL)?'bull':(pool===BEAR)?'bear':'neut';
    items.push({headline:t,source:rnd(SOURCES),sentiment:sent,mins:Math.floor(Math.random()*300)+5});
  }
  for(let i=0;i<4;i++){
    items.push({headline:rnd(MACRO),source:rnd(SOURCES),sentiment:'neut',mins:Math.floor(Math.random()*900)+60});
  }
  items.sort((a,b)=>a.mins-b.mins);
  return items.map(item=>({...item,timeStr:item.mins<60?`${item.mins}m ago`:`${Math.floor(item.mins/60)}h ago`}));
}
return{getNews};
})();
window.NEWS=NEWS;


/* ═══════════════════════════════════════════════════
   CP-6  APP CONTROLLER
   ─ Central state management and event wiring
   ─ loadTicker() — full panel refresh on ticker change
   ─ runArima(), runAIAnalysis() — async operations
   ─ exportPNG(), exportReport() — download functions
   ─ Watchlist add/remove, price alerts, crosshair
════════════════════════════════════════════════════ */
const APP=(()=>{
const state={
  ticker:'AAPL',quote:null,arimaRes:null,range:120,
  showMA:true,showBB:false,showVol:true,showArima:false,showFib:false,
  subChart:'RSI',arimaP:2,arimaD:1,arimaQ:1,
  watchlist:['AAPL','MSFT','NVDA','TSLA','GOOGL','META','AMZN','JPM','SPY','GLD'],
  activeWL:'AAPL',panelTab:'stats',
  aiResults:{},aiLoading:false,
  alerts:[],resizeTimer:null,
  selectedCountry:'United States',earthAnim:null,earthLastHit:null,
};
const $=id=>document.getElementById(id);

/* ── Toast ── */
function toast(msg,type='info'){
  const el=document.createElement('div');
  el.className=`toast ${type}`;el.textContent=msg;
  $('toast-area').appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),250);},3000);
}

/* ── Format helpers ── */
const fmt={
  price:v=>v>=1000?v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):v.toFixed(2),
  pct:v=>(v>=0?'+':'')+v.toFixed(2)+'%',
  vol:v=>v>=1e9?(v/1e9).toFixed(2)+'B':v>=1e6?(v/1e6).toFixed(2)+'M':v>=1e3?(v/1e3).toFixed(1)+'K':v,
  cap:v=>v>=1e12?(v/1e12).toFixed(2)+'T':v>=1e9?(v/1e9).toFixed(2)+'B':(v/1e6).toFixed(0)+'M',
  signed:v=>(v>=0?'+':'')+v.toFixed(2),
};

/* ── Clock ── */
function startClock(){
  function tick(){const el=$('clock');if(el)el.textContent='ET '+new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'America/New_York'});}
  tick();setInterval(tick,1000);
}

/* ── Market bar ── */
function refreshMarketBar(){
  const items=DATA.getWatchlist(['SPY','QQQ','GLD','BTC']);
  const bar=$('market-ticker');if(!bar)return;
  bar.innerHTML=items.map(q=>`<div class="mkt-item"><span class="sym">${q.ticker}</span><span class="px">${fmt.price(q.last)}</span><span class="chg ${q.changePct>=0?'bull-txt':'bear-txt'}">${fmt.pct(q.changePct)}</span></div>`).join('');
}

/* ── Landing page ticker strip ── */
function buildLandingTicker(){
  const tickers=['AAPL','MSFT','NVDA','TSLA','GOOGL','META','AMZN','SPY','QQQ','GLD','BTC','ETH'];
  const items=DATA.getWatchlist(tickers);
  const el=$('land-ticker');if(!el)return;
  const html=items.map(q=>`<div class="land-tick-item"><span class="land-tick-sym">${q.ticker}</span><span class="land-tick-px">${fmt.price(q.last)}</span><span class="land-tick-chg ${q.changePct>=0?'bull':'bear'}">${fmt.pct(q.changePct)}</span></div>`).join('');
  el.innerHTML=html+html; // duplicate for seamless loop
}

/* ── Watchlist ── */
function buildWatchlist(){
  const quotes=DATA.getWatchlist(state.watchlist);
  const ul=$('watchlist');if(!ul)return;ul.innerHTML='';
  quotes.forEach(q=>{
    const row=document.createElement('div');
    row.className=`wl-row ${q.ticker===state.activeWL?'active':''}`;
    row.dataset.ticker=q.ticker;
    const isBull=q.changePct>=0;
    const hasAlert=state.alerts.some(a=>a.ticker===q.ticker);
    row.innerHTML=`
      <div>
        <div class="wl-sym">${q.ticker}${hasAlert?'<span style="display:inline-block;width:5px;height:5px;background:var(--warn);border-radius:50%;margin-left:4px;vertical-align:middle"></span>':''}</div>
        <div class="wl-name">${DATA.NAMES[q.ticker]||''}</div>
      </div>
      <canvas width="60" height="26" data-spark="${q.ticker}"></canvas>
      <div>
        <div class="wl-px ${isBull?'bull-txt':'bear-txt'}">${fmt.price(q.last)}</div>
        <div class="wl-chg ${isBull?'bull-txt':'bear-txt'}">${fmt.pct(q.changePct)}</div>
      </div>
      <button class="wl-del" data-del="${q.ticker}" title="Remove">✕</button>
    `;
    row.querySelector('.wl-del').addEventListener('click',e=>{e.stopPropagation();removeFromWatchlist(q.ticker);});
    row.addEventListener('click',()=>loadTicker(q.ticker));
    ul.appendChild(row);
  });
  ul.querySelectorAll('canvas[data-spark]').forEach(canvas=>{
    const t=canvas.dataset.spark;
    const q=DATA.getQuote(t);drawSparkline(canvas,q.closes.slice(-30));
  });
}
function drawSparkline(canvas,data){
  const w=canvas.width,h=canvas.height,ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,w,h);if(!data.length)return;
  const min=Math.min(...data),max=Math.max(...data),span=max-min||1;
  const xs=data.map((_,i)=>(i/(data.length-1))*w);
  const ys=data.map(v=>h-((v-min)/span)*(h-2)-1);
  const isBull=data[data.length-1]>=data[0];
  ctx.beginPath();ctx.moveTo(xs[0],ys[0]);
  for(let i=1;i<xs.length;i++)ctx.lineTo(xs[i],ys[i]);
  ctx.strokeStyle=isBull?'#00e5a0':'#ff4560';ctx.lineWidth=1.5;ctx.stroke();
}
function addToWatchlist(ticker){
  ticker=ticker.toUpperCase().trim();
  if(!ticker||state.watchlist.includes(ticker)){toast(`${ticker} already in watchlist`,'warn');return;}
  state.watchlist.push(ticker);buildWatchlist();toast(`${ticker} added to watchlist`,'success');
}
function removeFromWatchlist(ticker){
  if(state.watchlist.length<=1){toast('Keep at least one ticker','warn');return;}
  state.watchlist=state.watchlist.filter(t=>t!==ticker);
  if(state.activeWL===ticker){state.activeWL=state.watchlist[0];loadTicker(state.activeWL);}
  else{buildWatchlist();}
  toast(`${ticker} removed`,'info');
}

/* ── Quote header ── */
function updateQuoteHeader(q){
  const isBull=q.changePct>=0;const hdr=$('quote-header');if(!hdr)return;
  const ind=q.indicators;
  let sig='NEUTRAL';
  if(q.last>(ind.ma50||0)&&q.last>(ind.ma200||0))sig='ABOVE MAs';
  else if(q.last<(ind.ma50||0)&&q.last<(ind.ma200||0))sig='BELOW MAs';
  hdr.innerHTML=`
    <div class="qh-ticker">${q.ticker}</div>
    <div class="qh-price ${isBull?'bull':'bear'}">${fmt.price(q.last)}</div>
    <div class="qh-change ${isBull?'bull':'bear'}">${fmt.signed(q.change)} (${fmt.pct(q.changePct)})</div>
    <div class="qh-stats">
      <div class="qh-stat"><span class="lbl">52W H</span><span class="val bull">${fmt.price(q.high52)}</span></div>
      <div class="qh-stat"><span class="lbl">52W L</span><span class="val bear">${fmt.price(q.low52)}</span></div>
      <div class="qh-stat"><span class="lbl">Avg Vol</span><span class="val">${fmt.vol(q.avgVol)}</span></div>
      <div class="qh-stat"><span class="lbl">Mkt Cap</span><span class="val">${fmt.cap(q.mktCap)}</span></div>
      <div class="qh-stat"><span class="lbl">Signal</span><span class="val ${sig==='ABOVE MAs'?'bull':sig==='BELOW MAs'?'bear':''}">${sig}</span></div>
    </div>`;
}

/* ── Stats panel ── */
function updateStatsPanel(q){
  const body=$('stats-body');if(!body)return;
  const b=q.bars[q.bars.length-1];
  body.innerHTML=`
    <div class="stat-grid">
      <div class="stat-row"><span class="stat-lbl">Open</span><span class="stat-val">${fmt.price(b.open)}</span></div>
      <div class="stat-row"><span class="stat-lbl">Close</span><span class="stat-val">${fmt.price(q.last)}</span></div>
      <div class="stat-row"><span class="stat-lbl">High</span><span class="stat-val bull">${fmt.price(b.high)}</span></div>
      <div class="stat-row"><span class="stat-lbl">Low</span><span class="stat-val bear">${fmt.price(b.low)}</span></div>
      <div class="stat-row"><span class="stat-lbl">Volume</span><span class="stat-val">${fmt.vol(b.vol)}</span></div>
      <div class="stat-row"><span class="stat-lbl">Avg Vol</span><span class="stat-val">${fmt.vol(q.avgVol)}</span></div>
      <div class="stat-row"><span class="stat-lbl">52W High</span><span class="stat-val bull">${fmt.price(q.high52)}</span></div>
      <div class="stat-row"><span class="stat-lbl">52W Low</span><span class="stat-val bear">${fmt.price(q.low52)}</span></div>
      <div class="stat-row"><span class="stat-lbl">Mkt Cap</span><span class="stat-val">${fmt.cap(q.mktCap)}</span></div>
      <div class="stat-row"><span class="stat-lbl">MA20</span><span class="stat-val">${q.indicators.ma20?.toFixed(2)||'—'}</span></div>
    </div>`;
}

/* ── Signals panel ── */
function updateSignalsPanel(q){
  const ind=q.indicators;const body=$('signals-body');if(!body)return;
  const rsi=ind.rsi;
  const rsiS=rsi>70?'OVERBOUGHT':rsi<30?'OVERSOLD':'NEUTRAL';
  const rsiC=rsi>70?'bear':rsi<30?'bull':'neut';
  const macdH=ind.hist;
  const macdC=macdH>0?'bull':'bear';
  const bb=ind.bb;let bbS='NEUTRAL',bbC='neut';
  if(bb?.upper&&q.last>bb.upper){bbS='ABOVE BB';bbC='bear';}
  else if(bb?.lower&&q.last<bb.lower){bbS='BELOW BB';bbC='bull';}
  const stoch=ind.stochSeries?.slice(-1)[0];
  const stochK=stoch?.k;const stochS=stochK>80?'OVERBOUGHT':stochK<20?'OVERSOLD':'NEUTRAL';
  const stochC=stochK>80?'bear':stochK<20?'bull':'neut';
  body.innerHTML=`
    <div class="signal-row"><span class="signal-lbl">RSI(14)</span><span class="signal-val">${rsi?.toFixed(1)}</span><span class="pill pill-${rsiC}">${rsiS}</span></div>
    <div class="signal-row"><span class="signal-lbl">MACD Hist</span><span class="signal-val">${macdH?.toFixed(3)}</span><span class="pill pill-${macdC}">${macdH>0?'BULLISH':'BEARISH'}</span></div>
    <div class="signal-row"><span class="signal-lbl">Bollinger</span><span class="signal-val">${bb?.mid?.toFixed(2)||'—'}</span><span class="pill pill-${bbC}">${bbS}</span></div>
    <div class="signal-row"><span class="signal-lbl">Stochastic</span><span class="signal-val">${stochK?.toFixed(1)||'—'}</span><span class="pill pill-${stochC}">${stochS}</span></div>
    <div class="signal-row"><span class="signal-lbl">vs MA50</span><span class="signal-val">${ind.ma50?.toFixed(2)||'—'}</span><span class="pill pill-${q.last>(ind.ma50||0)?'bull':'bear'}">${q.last>(ind.ma50||0)?'ABOVE':'BELOW'}</span></div>
    <div class="signal-row"><span class="signal-lbl">vs MA200</span><span class="signal-val">${ind.ma200?.toFixed(2)||'—'}</span><span class="pill pill-${q.last>(ind.ma200||0)?'bull':'bear'}">${q.last>(ind.ma200||0)?'ABOVE':'BELOW'}</span></div>`;
}

/* ── ARIMA panel ── */
function updateArimaPanel(){
  const body=$('arima-body');if(!body)return;
  const r=state.arimaRes;
  body.innerHTML=`
    <div class="param-row"><label>p</label><input type="range" id="sl-p" min="1" max="5" value="${state.arimaP}" step="1"><span class="pval" id="pv-p">${state.arimaP}</span></div>
    <div class="param-row"><label>d</label><input type="range" id="sl-d" min="0" max="2" value="${state.arimaD}" step="1"><span class="pval" id="pv-d">${state.arimaD}</span></div>
    <div class="param-row"><label>q</label><input type="range" id="sl-q" min="0" max="4" value="${state.arimaQ}" step="1"><span class="pval" id="pv-q">${state.arimaQ}</span></div>
    <button class="run-btn" id="run-arima">▶ RUN FORECAST (45d)</button>
    ${r?renderArimaResult(r):'<div class="muted" style="font-size:10px;margin-top:8px;text-align:center">Configure params and run forecast</div>'}`;
  ['p','d','q'].forEach(k=>{
    const sl=$(`sl-${k}`),pv=$(`pv-${k}`);
    sl?.addEventListener('input',()=>{state[`arima${k.toUpperCase()}`]=+sl.value;pv.textContent=sl.value;});
  });
  $('run-arima')?.addEventListener('click',runArima);
}
function renderArimaResult(r){
  const isBull=r.changePct>=0,cls=isBull?'bull':'bear';
  const f=r.forecasts[r.forecasts.length-1];
  const fill80L=((f.lo80-f.lo95)/(f.hi95-f.lo95))*100;
  const fill80W=((f.hi80-f.lo80)/(f.hi95-f.lo95))*100;
  const fillCtr=((r.target30-f.lo95)/(f.hi95-f.lo95))*100;
  return`<div class="arima-result">
    <div class="arima-target">
      <div><div class="lbl">30-Day Target</div><div class="val ${cls}">${fmt.price(r.target30)}</div></div>
      <div style="text-align:right"><div class="lbl">Expected Δ</div><div style="font-size:13px;font-weight:600" class="${cls}">${fmt.pct(r.changePct)}</div></div>
    </div>
    <div><div style="font-size:9px;color:var(--text3);margin-bottom:3px;text-transform:uppercase;letter-spacing:.06em">95% Confidence Band</div>
      <div class="ci-bar"><div class="ci-fill-95" style="left:0;width:100%"></div><div class="ci-fill-80" style="left:${Math.max(0,fill80L)}%;width:${Math.min(100,fill80W)}%"></div><div class="ci-center" style="left:${Math.max(0,Math.min(98,fillCtr))}%"></div></div>
      <div class="ci-labels"><span>${fmt.price(f.lo95)}</span><span>${fmt.price(f.hi95)}</span></div>
    </div>
    <div class="arima-params">ARIMA(<span>${r.params.p}</span>,<span>${r.params.d}</span>,<span>${r.params.q}</span>) &nbsp;·&nbsp; RMSE <span>${r.rmse.toFixed(3)}</span> &nbsp;·&nbsp; φ₁ <span>${r.phi[0]?.toFixed(3)||'—'}</span></div>
  </div>`;
}
function runArima(){
  const btn=$('run-arima');if(!btn||!state.quote)return;
  btn.classList.add('loading');btn.textContent='⏳ FITTING…';
  setTimeout(()=>{
    const res=window.ARIMA.fitARIMA(state.quote.closes,state.arimaP,state.arimaD,state.arimaQ,45);
    if(!res){toast('Not enough data for ARIMA','error');btn.classList.remove('loading');btn.textContent='▶ RUN FORECAST (45d)';return;}
    state.arimaRes=res;state.showArima=true;
    updateArimaPanel();renderCharts();
    document.querySelector('[data-overlay="arima"]')?.classList.add('on');
    toast(`ARIMA(${res.params.p},${res.params.d},${res.params.q}) fitted · RMSE ${res.rmse.toFixed(2)}`,'success');
  },80);
}

/* ── News panel ── */
function updateNewsPanel(){
  const body=$('news-body');if(!body||!state.quote)return;
  const items=NEWS.getNews(state.ticker,state.quote);
  body.innerHTML=items.map(item=>`
    <div class="news-item">
      <div class="news-headline">${item.headline}</div>
      <div class="news-meta">
        <span class="news-sent sent-${item.sentiment}">${item.sentiment.toUpperCase()}</span>
        <span class="news-source">${item.source}</span>
        <span class="news-time">${item.timeStr}</span>
      </div>
    </div>`).join('');
}

/* ── Claude AI panel ── */
async function runAIAnalysis(mode){
  if(state.aiLoading||!state.quote)return;
  state.aiLoading=true;
  const area=$('ai-result-area');
  document.querySelectorAll('.ai-btn').forEach(b=>b.classList.add('loading'));
  if(area){area.innerHTML=`<div class="ai-loading"><div class="ai-dots"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div></div><span>Generating ${CLAUDE_AI.MODES[mode].label}…</span></div>`;}
  try{
    const text=await CLAUDE_AI.analyze(state.ticker,state.quote,mode);
    state.aiResults[`${state.ticker}_${mode}`]=text;
    const m=CLAUDE_AI.MODES[mode];
    if(area){area.innerHTML=`<div class="ai-result"><div class="ai-result-hdr"><span class="ai-result-mode" style="color:${m.color}">${m.label}</span><span style="font-size:9px;color:var(--text3)">${state.ticker} · ${new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</span></div><div class="ai-result-body">${text}</div></div>`;}
    toast('Analysis complete','success');
  }catch(e){
    if(area){area.innerHTML=`<div class="ai-placeholder"><strong>Analysis Error</strong>Unable to fetch analysis: ${e.message}</div>`;}
    toast('AI analysis failed — check connection','error');
  }finally{
    state.aiLoading=false;
    document.querySelectorAll('.ai-btn').forEach(b=>b.classList.remove('loading'));
  }
}

/* ── Export functions ── */
function exportPNG(){
  if(!state.quote){toast('Load a ticker first','warn');return;}
  const canvas=$('main-canvas');
  const link=document.createElement('a');
  link.download=`${state.ticker}_chart_${new Date().toISOString().slice(0,10)}.png`;
  link.href=canvas.toDataURL('image/png');link.click();
  toast(`${state.ticker} chart exported as PNG`,'success');
}
function exportReport(){
  if(!state.quote){toast('Load a ticker first','warn');return;}
  const q=state.quote;const ind=q.indicators;const d=new Date();
  const lines=[
    `EQUITEX TERMINAL · RESEARCH REPORT`,
    `Generated: ${d.toLocaleString()} ET`,
    `Roll: 25/SET/BCSE/382`,
    `${'─'.repeat(50)}`,
    ``,
    `TICKER: ${q.ticker}  |  ${DATA.NAMES[q.ticker]||q.ticker}`,
    ``,
    `PRICE DATA`,
    `  Last Price:     $${fmt.price(q.last)}`,
    `  Day Change:     ${fmt.signed(q.change)} (${fmt.pct(q.changePct)})`,
    `  52W High:       $${fmt.price(q.high52)}`,
    `  52W Low:        $${fmt.price(q.low52)}`,
    `  Avg Volume:     ${fmt.vol(q.avgVol)}`,
    `  Market Cap:     ${fmt.cap(q.mktCap)}`,
    ``,
    `TECHNICAL INDICATORS`,
    `  RSI(14):        ${ind.rsi?.toFixed(2)}  ${ind.rsi>70?'[OVERBOUGHT]':ind.rsi<30?'[OVERSOLD]':'[NEUTRAL]'}`,
    `  MACD:           ${ind.macd?.toFixed(4)}`,
    `  MACD Signal:    ${ind.signal?.toFixed(4)}`,
    `  MACD Hist:      ${ind.hist?.toFixed(4)}  ${ind.hist>0?'[BULLISH]':'[BEARISH]'}`,
    `  BB Upper:       $${ind.bb?.upper?.toFixed(2)||'—'}`,
    `  BB Mid:         $${ind.bb?.mid?.toFixed(2)||'—'}`,
    `  BB Lower:       $${ind.bb?.lower?.toFixed(2)||'—'}`,
    `  MA20:           $${ind.ma20?.toFixed(2)||'—'}  ${q.last>(ind.ma20||0)?'[ABOVE]':'[BELOW]'}`,
    `  MA50:           $${ind.ma50?.toFixed(2)||'—'}  ${q.last>(ind.ma50||0)?'[ABOVE]':'[BELOW]'}`,
    `  MA200:          $${ind.ma200?.toFixed(2)||'—'}  ${q.last>(ind.ma200||0)?'[ABOVE]':'[BELOW]'}`,
    `  OBV:            ${fmt.vol(ind.obv||0)}`,
    ``,
  ];
  if(state.arimaRes){
    const r=state.arimaRes;const f=r.forecasts[29];
    lines.push(`ARIMA FORECAST  (p=${r.params.p}, d=${r.params.d}, q=${r.params.q})`);
    lines.push(`  30-Day Target:  $${fmt.price(r.target30)}  (${fmt.pct(r.changePct)})`);
    lines.push(`  95% CI:         $${fmt.price(f.lo95)} – $${fmt.price(f.hi95)}`);
    lines.push(`  RMSE:           ${r.rmse.toFixed(4)}`);
    lines.push(``);
  }
  const cached=Object.entries(state.aiResults).filter(([k])=>k.startsWith(state.ticker+'_'));
  if(cached.length){
    lines.push(`AI ANALYSIS (Claude · Anthropic)`);
    cached.forEach(([key,text])=>{
      const mode=key.split('_')[1].toUpperCase();
      lines.push(`  [${mode}]`);
      lines.push(`  ${text}`);lines.push(``);
    });
  }
  lines.push(`${'─'.repeat(50)}`);
  lines.push(`⚠ DISCLAIMER: Simulated data only. Not financial advice.`);
  lines.push(`   For educational/demonstration purposes. 25/SET/BCSE/382`);
  const blob=new Blob([lines.join('\n')],{type:'text/plain'});
  const link=document.createElement('a');
  link.download=`${state.ticker}_report_${d.toISOString().slice(0,10)}.txt`;
  link.href=URL.createObjectURL(blob);link.click();
  toast(`${state.ticker} report exported`,'success');
}

/* ── Price Alerts ── */
function openAlertModal(){
  const modal=$('alert-modal');if(!modal)return;
  $('alert-ticker-label').textContent=state.ticker;
  $('alert-price-input').value='';
  renderAlertsList();
  modal.classList.remove('hidden');
}
function closeAlertModal(){$('alert-modal')?.classList.add('hidden');}
function setAlert(){
  const price=parseFloat($('alert-price-input')?.value);
  const dir=$('alert-dir-select')?.value;
  if(!price||isNaN(price)){toast('Enter a valid price','warn');return;}
  state.alerts.push({ticker:state.ticker,price,direction:dir,triggered:false});
  renderAlertsList();buildWatchlist();
  $('alert-price-input').value='';
  toast(`Alert set: ${state.ticker} ${dir==='above'?'↑':'↓'} $${price.toFixed(2)}`,'success');
}
function removeAlert(idx){state.alerts.splice(idx,1);renderAlertsList();buildWatchlist();}
function renderAlertsList(){
  const el=$('alerts-list');if(!el)return;
  if(!state.alerts.length){el.innerHTML='<div style="font-size:10px;color:var(--text3);padding:4px 0">No alerts set</div>';return;}
  el.innerHTML=`<div style="font-size:10px;color:var(--text3);margin-bottom:6px">Active Alerts</div>`+
    state.alerts.map((a,i)=>`<div class="alert-item"><div class="alert-info"><span class="alert-sym">${a.ticker}</span> ${a.direction==='above'?'↑':'↓'} $${a.price.toFixed(2)}</div><button class="alert-del" data-idx="${i}">✕</button></div>`).join('');
  el.querySelectorAll('.alert-del').forEach(btn=>btn.addEventListener('click',()=>removeAlert(+btn.dataset.idx)));
}
function checkAlerts(){
  if(!state.quote)return;
  state.alerts.forEach((a,i)=>{
    if(a.triggered)return;
    const cur=DATA.getQuote(a.ticker).last;
    const fired=(a.direction==='above'&&cur>=a.price)||(a.direction==='below'&&cur<=a.price);
    if(fired){a.triggered=true;toast(`🔔 ALERT: ${a.ticker} ${a.direction==='above'?'↑':'↓'} $${a.price.toFixed(2)} · Now $${cur.toFixed(2)}`,'warn');}
  });
}

/* ── Render charts ── */

/* Global market earth model */
const EARTH_COUNTRIES=[
  {name:'United States',code:'US',lat:38,lon:-97,index:'S&P 500 Proxy',tickers:['AAPL','MSFT','NVDA','JPM']},
  {name:'Canada',code:'CA',lat:56,lon:-106,index:'TSX Composite Proxy',tickers:['SHOP','RY','TD','CNQ']},
  {name:'Brazil',code:'BR',lat:-10,lon:-55,index:'Bovespa Proxy',tickers:['PBR','VALE','ITUB','ABEV']},
  {name:'United Kingdom',code:'GB',lat:54,lon:-2,index:'FTSE 100 Proxy',tickers:['HSBC','BP','AZN','UL']},
  {name:'Germany',code:'DE',lat:51,lon:10,index:'DAX Proxy',tickers:['SAP','SIEGY','DTEGY','BMWYY']},
  {name:'France',code:'FR',lat:46,lon:2,index:'CAC 40 Proxy',tickers:['LVMUY','TTE','AIR','OR']},
  {name:'India',code:'IN',lat:22,lon:79,index:'Nifty 50 Proxy',tickers:['RELIANCE','TCS','HDB','INFY']},
  {name:'China',code:'CN',lat:35,lon:104,index:'CSI 300 Proxy',tickers:['BABA','NIO','BIDU','JD']},
  {name:'Japan',code:'JP',lat:36,lon:138,index:'Nikkei 225 Proxy',tickers:['TM','SONY','MUFG','NTDOY']},
  {name:'South Korea',code:'KR',lat:36,lon:128,index:'KOSPI Proxy',tickers:['SSNLF','HYMTF','KB','SKM']},
  {name:'Taiwan',code:'TW',lat:24,lon:121,index:'TAIEX Proxy',tickers:['TSM','UMC','ASX','CHT']},
  {name:'Australia',code:'AU',lat:-25,lon:133,index:'ASX 200 Proxy',tickers:['BHP','RIO','CBAUF','WBC']},
  {name:'Saudi Arabia',code:'SA',lat:24,lon:45,index:'Tadawul Proxy',tickers:['ARAMCO','SABIC','ALRAJHI','STC']},
  {name:'South Africa',code:'ZA',lat:-30,lon:25,index:'JSE Proxy',tickers:['NPSNY','GFI','SBSW','MTN']},
  {name:'Mexico',code:'MX',lat:23,lon:-102,index:'IPC Proxy',tickers:['AMX','FMX','PAC','TV']}
];
const EARTH_MARKET_CACHE={};
function countryQuotes(country){return country.tickers.map(t=>DATA.getQuote(t));}
function countrySnapshot(country){
  const now=Date.now(),cached=EARTH_MARKET_CACHE[country.code];
  if(cached&&now-cached.ts<2500)return cached.data;
  const quotes=countryQuotes(country).map((q,i)=>({...q,liveChangePct:+(q.changePct+Math.sin(now/7000+i+country.lon)*0.12).toFixed(2)}));
  const avg=quotes.reduce((s,q)=>s+q.liveChangePct,0)/quotes.length;
  const adv=quotes.filter(q=>q.liveChangePct>=0).length;const cap=quotes.reduce((s,q)=>s+q.mktCap,0);
  const vol=quotes.reduce((s,q)=>s+q.avgVol,0);const primary=quotes.reduce((best,q)=>Math.abs(q.liveChangePct)>Math.abs(best.liveChangePct)?q:best,quotes[0]);
  const data={quotes,avg:+avg.toFixed(2),adv,cap,vol,primary};
  EARTH_MARKET_CACHE[country.code]={ts:now,data};return data;
}
function fmtSignedPct(v){return `${v>=0?'+':''}${v.toFixed(2)}%`;}
function projectEarthPoint(country,w,h,rot){
  const lat=country.lat*Math.PI/180,lon=(country.lon+rot)*Math.PI/180;
  const radius=Math.min(w,h)*0.36,cx=w*0.5,cy=h*0.52;
  const x=Math.cos(lat)*Math.sin(lon),y=Math.sin(lat),z=Math.cos(lat)*Math.cos(lon);
  return{x:cx+x*radius,y:cy-y*radius,z,r:radius};
}
function resizeEarth(){
  const c=$('earth-canvas');if(!c)return;
  const rect=c.getBoundingClientRect();const dpr=window.devicePixelRatio||1;
  if(rect.width<10||rect.height<10)return;
  c.width=Math.floor(rect.width*dpr);c.height=Math.floor(rect.height*dpr);
  const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);renderEarth();
}
function renderEarth(){
  const c=$('earth-canvas');if(!c)return;
  const rect=c.getBoundingClientRect();if(rect.width<10||rect.height<10)return;
  const ctx=c.getContext('2d'),w=rect.width,h=rect.height,t=Date.now()*0.006;
  ctx.clearRect(0,0,w,h);
  const r=Math.min(w,h)*0.36,cx=w*0.5,cy=h*0.52;
  const ocean=ctx.createRadialGradient(cx-r*0.35,cy-r*0.35,r*0.1,cx,cy,r);
  ocean.addColorStop(0,'rgba(27,84,116,0.92)');ocean.addColorStop(0.62,'rgba(10,34,54,0.96)');ocean.addColorStop(1,'rgba(1,8,14,1)');
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle=ocean;ctx.fill();
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();
  ctx.strokeStyle='rgba(0,229,160,0.11)';ctx.lineWidth=1;
  for(let lat=-60;lat<=60;lat+=30){const y=cy-Math.sin(lat*Math.PI/180)*r;ctx.beginPath();ctx.ellipse(cx,y,r*Math.cos(lat*Math.PI/180),r*0.08,0,0,Math.PI*2);ctx.stroke();}
  for(let lon=0;lon<360;lon+=30){const x=Math.sin((lon+t)*Math.PI/180)*r;ctx.beginPath();ctx.ellipse(cx+x*0.03,cy,Math.abs(x),r,0,Math.PI*1.5,Math.PI*0.5);ctx.stroke();}
  ctx.fillStyle='rgba(0,229,160,0.18)';
  [[-102,54,40,22],[-62,-14,26,34],[18,5,46,54],[78,31,58,34],[135,-25,24,18]].forEach(p=>{const pt=projectEarthPoint({lat:p[1],lon:p[0]},w,h,t);if(pt.z>-.12){ctx.globalAlpha=Math.max(0.12,pt.z);ctx.beginPath();ctx.ellipse(pt.x,pt.y,p[2]*r/160,p[3]*r/160,0,0,Math.PI*2);ctx.fill();}});
  ctx.globalAlpha=1;state.earthLastHit=[];
  EARTH_COUNTRIES.forEach(country=>{
    const pt=projectEarthPoint(country,w,h,t);if(pt.z<=-0.08)return;
    const snap=countrySnapshot(country),isSel=country.name===state.selectedCountry,size=(isSel?6:4)+pt.z*2,pulse=(Math.sin(Date.now()/260)+1)*1.6;
    state.earthLastHit.push({...pt,country,size:size+8});
    ctx.beginPath();ctx.arc(pt.x,pt.y,size+(isSel?pulse:0),0,Math.PI*2);ctx.fillStyle=snap.avg>=0?'rgba(0,229,160,0.20)':'rgba(255,69,96,0.20)';ctx.fill();
    ctx.beginPath();ctx.arc(pt.x,pt.y,size,0,Math.PI*2);ctx.fillStyle=snap.avg>=0?'#00e5a0':'#ff4560';ctx.fill();
    ctx.fillStyle='rgba(203,213,225,0.78)';ctx.font='10px JetBrains Mono, monospace';ctx.fillText(country.code,pt.x+8,pt.y-7);
  });
  ctx.restore();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.strokeStyle='rgba(0,229,160,0.35)';ctx.lineWidth=1;ctx.stroke();
}
function updateEarthPanel(countryName=state.selectedCountry){
  const country=EARTH_COUNTRIES.find(c=>c.name===countryName)||EARTH_COUNTRIES[0];state.selectedCountry=country.name;
  const snap=countrySnapshot(country),cls=snap.avg>=0?'bull':'bear';
  const name=$('earth-country-name'),region=$('earth-region-label'),index=$('earth-index-name'),chg=$('earth-index-change'),metrics=$('earth-metrics'),list=$('earth-stock-list');
  if(name)name.textContent=country.name;if(region)region.textContent=country.name.toUpperCase();if(index)index.textContent=country.index;if(chg){chg.textContent=fmtSignedPct(snap.avg);chg.className=cls;}
  if(metrics){metrics.innerHTML=`<div class="earth-metric"><div class="lbl">Index Move</div><div class="val ${cls}">${fmtSignedPct(snap.avg)}</div></div><div class="earth-metric"><div class="lbl">Advancers</div><div class="val">${snap.adv}/${snap.quotes.length}</div></div><div class="earth-metric"><div class="lbl">Mkt Cap</div><div class="val">${fmt.cap(snap.cap)}</div></div><div class="earth-metric"><div class="lbl">Avg Vol</div><div class="val">${fmt.vol(snap.vol)}</div></div>`;}
  if(list){list.innerHTML=snap.quotes.map(q=>`<div class="earth-stock ${q.ticker===state.ticker?'active':''}" data-ticker="${q.ticker}"><span class="sym">${q.ticker}</span><span class="name">${q.name}</span><span class="chg ${q.liveChangePct>=0?'bull':'bear'}">${fmt.pct(q.liveChangePct)}</span></div>`).join('');list.querySelectorAll('.earth-stock').forEach(row=>row.addEventListener('click',()=>loadTicker(row.dataset.ticker)));}
  const btn=$('earth-load-primary');if(btn)btn.onclick=()=>loadTicker(snap.primary.ticker);
}
function selectEarthCountry(e){
  const c=$('earth-canvas');if(!c||!state.earthLastHit)return;
  const rect=c.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
  let best=null,dist=1e9;state.earthLastHit.forEach(hit=>{const d=Math.hypot(hit.x-x,hit.y-y);if(d<hit.size&&d<dist){best=hit.country;dist=d;}});
  if(best){updateEarthPanel(best.name);toast(`${best.name} market selected`,'success');}
}
function syncCountryByTicker(ticker){
  const country=EARTH_COUNTRIES.find(c=>c.tickers.includes(ticker));if(country)updateEarthPanel(country.name);else updateEarthPanel(state.selectedCountry);
}
function initEarth(){
  updateEarthPanel(state.selectedCountry);resizeEarth();
  $('earth-canvas')?.addEventListener('click',selectEarthCountry);
  if(!state.earthAnim){const loop=()=>{renderEarth();state.earthAnim=requestAnimationFrame(loop);};state.earthAnim=requestAnimationFrame(loop);}
  setInterval(()=>updateEarthPanel(state.selectedCountry),12000);
}
function renderCharts(){
  const q=state.quote;if(!q)return;
  const mc=$('main-canvas'),sc=$('sub-canvas');if(!mc)return;
  CHART.render(mc,q,{showMA:state.showMA,showBB:state.showBB,showVol:state.showVol,showArima:state.showArima,showFib:state.showFib,arimaRes:state.arimaRes,range:state.range});
  if(!sc)return;
  const ind=q.indicators;
  if(state.subChart==='RSI')CHART.renderRSI(sc,ind.rsiSeries,state.range);
  else if(state.subChart==='MACD')CHART.renderMACD(sc,ind.macdSeries,state.range);
  else if(state.subChart==='STOCH')CHART.renderStoch(sc,ind.stochSeries,state.range,'STOCH');
  else if(state.subChart==='STOCHRSI')CHART.renderStoch(sc,ind.stochRSISeries,state.range,'STOCH-RSI');
  else if(state.subChart==='OBV')CHART.renderOBV(sc,ind.obvSeries,state.range);
}

/* ── Load ticker ── */
function loadTicker(ticker){
  ticker=ticker.toUpperCase().trim();if(!ticker)return;
  state.ticker=ticker;state.activeWL=ticker;state.arimaRes=null;state.showArima=false;
  document.querySelector('[data-overlay="arima"]')?.classList.remove('on');
  state.quote=DATA.getQuote(ticker);
  syncCountryByTicker(ticker);
  const q=state.quote;
  updateQuoteHeader(q);updateStatsPanel(q);updateSignalsPanel(q);
  updateArimaPanel();updateNewsPanel();
  const aiTickerName=$('ai-ticker-name');if(aiTickerName)aiTickerName.textContent=`${ticker} (${DATA.NAMES[ticker]||ticker})`;
  const aiArea=$('ai-result-area');
  if(aiArea&&!state.aiResults[`${ticker}_last`]){
    aiArea.innerHTML=`<div class="ai-placeholder"><strong>Ready to analyze ${ticker}</strong>Select an analysis mode above to generate an AI research note powered by Claude.</div>`;
  }
  renderCharts();buildWatchlist();
  const inp=$('ticker-input');if(inp)inp.value=ticker;
  checkAlerts();
}

/* ── Crosshair ── */
function initCrosshair(){
  const mc=$('main-canvas'),tt=$('crosshair-tooltip');
  if(!mc||!tt)return;
  mc.addEventListener('mousemove',e=>{
    if(!state.quote)return;
    const rect=mc.getBoundingClientRect();const mx=e.clientX-rect.left;
    const bars=state.quote.bars.slice(-state.range);
    const plotW=mc.offsetWidth-12-72;
    const idx=Math.round((mx-12)/plotW*(bars.length-1));
    const bar=bars[Math.max(0,Math.min(bars.length-1,idx))];
    if(!bar)return;
    tt.style.display='block';
    tt.style.left=Math.min(mx+14,mc.offsetWidth-200)+'px';
    tt.style.top='28px';
    const isBull=bar.close>=bar.open;
    tt.innerHTML=`<div style="color:var(--text3);margin-bottom:2px;font-size:9px">${bar.date}</div><div>O <span style="color:var(--text)">${bar.open}</span>  H <span class="${isBull?'bull':'bear'}">${bar.high}</span>  L <span class="${isBull?'bear':'bull'}">${bar.low}</span>  C <span style="color:var(--text);font-weight:700">${bar.close}</span></div><div style="color:var(--text3);margin-top:2px">Vol <span style="color:var(--text)">${(bar.vol/1e6).toFixed(2)}M</span></div>`;
  });
  mc.addEventListener('mouseleave',()=>{tt.style.display='none';});
}

/* ── Panel tab switch ── */
function initPanelTabs(){
  document.querySelectorAll('.panel-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      document.querySelectorAll('.panel-tab').forEach(t=>t.classList.remove('active'));
      document.querySelectorAll('.panel-tc').forEach(c=>c.classList.remove('active'));
      tab.classList.add('active');
      $(`ptab-${tab.dataset.ptab}`)?.classList.add('active');
      state.panelTab=tab.dataset.ptab;
      if(tab.dataset.ptab==='news')updateNewsPanel();
    });
  });
}

/* ── Wire controls ── */
function wireControls(){
  // Range
  document.querySelectorAll('[data-range]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      state.range=+btn.dataset.range;
      document.querySelectorAll('[data-range]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');renderCharts();
    });
  });
  // Overlays
  document.querySelectorAll('[data-overlay]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const k=btn.dataset.overlay;
      if(k==='ma'){state.showMA=!state.showMA;btn.classList.toggle('on',state.showMA);}
      if(k==='bb'){state.showBB=!state.showBB;btn.classList.toggle('on',state.showBB);}
      if(k==='vol'){state.showVol=!state.showVol;btn.classList.toggle('on',state.showVol);}
      if(k==='arima'){state.showArima=!state.showArima;btn.classList.toggle('on',state.showArima);}
      if(k==='fib'){state.showFib=!state.showFib;btn.classList.toggle('on',state.showFib);btn.classList.toggle('on-fib',state.showFib);}
      renderCharts();
    });
  });
  // Sub-chart tabs
  document.querySelectorAll('.sc-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      state.subChart=tab.dataset.chart;
      document.querySelectorAll('.sc-tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');renderCharts();
    });
  });
  // Search
  $('ticker-input')?.addEventListener('keydown',e=>{if(e.key==='Enter'){const t=e.target.value.trim().toUpperCase();if(t)loadTicker(t);}});
  // Watchlist add
  $('wl-add-btn')?.addEventListener('click',()=>{const inp=$('wl-add-input');if(inp){addToWatchlist(inp.value);inp.value='';}});
  $('wl-add-input')?.addEventListener('keydown',e=>{if(e.key==='Enter'){addToWatchlist(e.target.value);e.target.value='';}});
  // AI buttons
  document.querySelectorAll('[data-ai]').forEach(btn=>{btn.addEventListener('click',()=>runAIAnalysis(btn.dataset.ai));});
  // Export
  $('export-png-btn')?.addEventListener('click',exportPNG);
  $('export-report-btn')?.addEventListener('click',exportReport);
  // Alerts
  $('alert-btn')?.addEventListener('click',openAlertModal);
  $('alert-set-btn')?.addEventListener('click',setAlert);
  $('alert-cancel-btn')?.addEventListener('click',closeAlertModal);
  $('alert-modal')?.addEventListener('click',e=>{if(e.target===$('alert-modal'))closeAlertModal();});
  // Home / landing
  $('home-btn')?.addEventListener('click',()=>{
    $('landing')?.classList.remove('out');
    $('app').style.display='none';
  });
  // Resize
  window.addEventListener('resize',()=>{clearTimeout(state.resizeTimer);state.resizeTimer=setTimeout(()=>{renderCharts();resizeEarth();},120);});
  // Alert check interval
  setInterval(checkAlerts,30000);
}

/* ── Landing page ── */
function initLanding(){
  buildLandingTicker();
  $('launch-btn')?.addEventListener('click',()=>{
    $('landing').classList.add('out');
    setTimeout(()=>{
      $('loading').style.display='flex';
      setTimeout(()=>{
        $('loading').classList.add('hidden');
        $('app').style.display='grid';
        setTimeout(()=>{renderCharts();resizeEarth();renderEarth();},100);
      },1400);
    },500);
  });
}

/* ── Boot ── */
function init(){
  initLanding();
  startClock();
  refreshMarketBar();
  buildWatchlist();
  initPanelTabs();
  wireControls();
  initEarth();
  // Default active overlays
  document.querySelector('[data-overlay="ma"]')?.classList.add('on');
  document.querySelector('[data-overlay="vol"]')?.classList.add('on');
  document.querySelector('[data-range="120"]')?.classList.add('active');
  document.querySelector('.sc-tab[data-chart="RSI"]')?.classList.add('active');
  loadTicker(state.ticker);
  // The app starts hidden; landing page shows first
  $('app').style.display='none';
  $('loading').style.display='none';
}

return{init,loadTicker,toast,exportPNG,exportReport};
})();

window.APP=APP;
window.addEventListener('DOMContentLoaded',()=>APP.init());
