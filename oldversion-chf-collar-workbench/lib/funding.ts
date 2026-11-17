import {days, type Config} from './finance';

/** S = USD paid for one CHF. Leverage is borrowing / equity, not assets / equity. */
export function resolveFunding(c:Config):Config {
 if(c.loanSizing !== 'leverage' || c.mode !== 'loan') return c;
 const multiple=c.borrowMultiple ?? 0;
 if(!Number.isFinite(multiple)||multiple<0) return c; // Preserve invalid draft for the UI validation message.
 if(!(Number.isFinite(c.equity)&&c.equity>0&&Number.isFinite(c.spot)&&c.spot>0)) return c;
 return {...c,loan:c.equity*multiple/c.spot};
}

export function fundingSummary(c:Config, repayCHF:number) {
 const loanCHF=c.mode==='loan'?c.loan:0, borrowedUSD=loanCHF*c.spot;
 return {borrowedUSD,loanCHF,repayCHF:c.mode==='loan'?repayCHF:0,
  interestCHF:c.mode==='loan'?repayCHF-loanCHF:0,
  borrowMultiple:borrowedUSD/c.equity,totalMultiple:1+borrowedUSD/c.equity,
  grossUSD:c.equity+borrowedUSD,days:days(c.start,c.end)};
}
