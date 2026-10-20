const smallNumbers:Record<string,number> = {
  zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,
  ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,
  twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90
};
const numberWords=new RegExp(`\\b(?:${Object.keys(smallNumbers).join('|')}|hundred|thousand|million|point)(?:[ -]+(?:${Object.keys(smallNumbers).join('|')}|hundred|thousand|million|point|and))*\\b`,'g');
const cardinal=`(?:\\d+(?:\\.\\d+)?|(?:${Object.keys(smallNumbers).join('|')})(?:[ -]+(?:${Object.keys(smallNumbers).join('|')}|hundred|thousand|million|and))*)`;
const denominators:Record<string,number>={half:2,halves:2,third:3,thirds:3,quarter:4,quarters:4,fourth:4,fourths:4,fifth:5,fifths:5,sixth:6,sixths:6,seventh:7,sevenths:7,eighth:8,eighths:8,ninth:9,ninths:9,tenth:10,tenths:10};
const denominatorWords=Object.keys(denominators).join('|');

function spokenNumber(phrase:string):string {
  const words=phrase.split(/[ -]+/);
  let total=0,group=0,previous:number|undefined,lastScale=Infinity;
  let hundred=false;
  for(let index=0;index<words.length;index++) {
    const word=words[index];
    if(word==='point') {
      const digits=words.slice(index+1).map(part=>smallNumbers[part]);
      if(!digits.length||digits.some(value=>value===undefined||value>9))throw new Error('Invalid decimal');
      return `${total+group}.${digits.join('')}`;
    }
    if(word==='and') {
      if(index===0||index===words.length-1||words[index-1]==='and'||(!hundred&&!total)||previous!==undefined)throw new Error('Invalid number');
      continue;
    }
    if(word==='hundred') {
      if(hundred||previous===undefined||previous<1||previous>9||group!==previous)throw new Error('Invalid hundred');
      group*=100;hundred=true;previous=undefined;continue;
    }
    if(word==='thousand'||word==='million') {
      const scale=word==='thousand'?1000:1000000;
      if(!group||scale>=lastScale)throw new Error('Invalid scale');
      total+=group*scale;group=0;previous=undefined;hundred=false;lastScale=scale;continue;
    }
    const value=smallNumbers[word];
    if(value===undefined||(previous!==undefined&&!(previous>=20&&previous%10===0&&value>0&&value<10)))throw new Error('Invalid number');
    group+=value;previous=value;
  }
  return String(total+group);
}

function fractionNumber(phrase:string):string {
  return phrase==='a'||phrase==='an'?'1':/^\d/.test(phrase)?phrase:spokenNumber(phrase);
}

function spokenNumbers(phrase:string):string {
  try{return spokenNumber(phrase);}
  catch {
    const parts=phrase.split(' and ');
    for(let index=parts.length-1;index>0;index--) {
      try {
        return `${spokenNumber(parts.slice(0,index).join(' and '))} and ${spokenNumber(parts.slice(index).join(' and '))}`;
      }catch {continue;}
    }
    throw new Error('Invalid numbers');
  }
}

function fractions(expression:string):string {
  return expression
    .replace(new RegExp(`\\b(${cardinal})\\s+and\\s+(?:(a|an|${cardinal})[ -]+)?(${denominatorWords})\\b`,'g'),
      (_match,whole:string,numerator:string|undefined,denominator:string)=>`(${fractionNumber(whole)}+(${fractionNumber(numerator??'a')}/${denominators[denominator]}))`)
    .replace(new RegExp(`\\b(a|an|${cardinal})[ -]+(${denominatorWords})\\b`,'g'),
      (_match,numerator:string,denominator:string)=>`(${fractionNumber(numerator)}/${denominators[denominator]})`)
    .replace(/\b(\d+)\s+(\d+)\s*\/\s*(\d+)\b/g,'($1+($2/$3))')
    .replace(/\bhalf of\s+/g,'(1/2)*').replace(/\bhalf\b/g,'(1/2)')
    .replace(/\bquarter of\s+/g,'(1/4)*')
    .replace(/\)\s+of\s+/g,')*');
}

function arithmeticPhrases(expression:string):string {
  const pairPatterns:[RegExp,(left:string,right:string)=>string][]=[
    [/^(?:the )?sum of (.+?) and (.+)$/, (left,right)=>`(${left})+(${right})`],
    [/^(?:the )?difference (?:between|of) (.+?) and (.+)$/, (left,right)=>`(${left})-(${right})`],
    [/^(?:the )?product of (.+?) and (.+)$/, (left,right)=>`(${left})*(${right})`],
    [/^(?:the )?quotient of (.+?) and (.+)$/, (left,right)=>`(${left})/(${right})`],
    [/^add (.+?) (?:to|and) (.+)$/, (left,right)=>`(${left})+(${right})`],
    [/^subtract (.+?) from (.+)$/, (left,right)=>`(${right})-(${left})`],
    [/^(.+?) subtracted from (.+)$/, (left,right)=>`(${right})-(${left})`],
    [/^multiply (.+?) (?:by|and) (.+)$/, (left,right)=>`(${left})*(${right})`],
    [/^divide (.+?) by (.+)$/, (left,right)=>`(${left})/(${right})`],
    [/^(.+?) divided into (.+)$/, (left,right)=>`(${right})/(${left})`],
    [/^(.+?) (?:increased|decreased) by (.+?)\s*(?:percent|per cent|%)$/, (left,right)=>`(${left})*(1${expression.includes('decreased')?'-':'+'}(${right})/100)`],
    [/^(.+?)\s*(?:percent|per cent|%) (?:off|of) (.+)$/, (left,right)=>expression.includes(' off ')?`(${right})*(1-(${left})/100)`:`(${left})/100*(${right})`]
  ];
  for(const [pattern,convert] of pairPatterns) {
    const match=expression.match(pattern);
    if(match)return convert(match[1],match[2]);
  }
  return expression;
}

function wordProblem(expression:string):string {
  const amount='(\\d+(?:\\.\\d+)?)';
  const patterns:[RegExp,string][]=[
    [new RegExp(`^(?:if )?i have ${amount} ([a-z]+)[,.]? (?:and |then )?(?:i )?(?:get|buy|receive|find) ${amount}(?: more(?: \\2)?| \\2)?[,.]? how many(?: \\2)? (?:do i have|are there)(?: now| in total| altogether)?$`),'$1+$3'],
    [new RegExp(`^(?:if )?i have ${amount} ([a-z]+)[,.]? (?:and |then )?(?:i )?(?:give away|lose|eat|spend|use) ${amount}(?: (?:of them|\\2))?[,.]? how many(?: \\2)? (?:are left|do i have left|remain)(?: now)?$`),'$1-$3'],
    [new RegExp(`^(?:if )?${amount} ([a-z]+) cost \\$?${amount}(?: dollars)? each[,.]? (?:what is|what's) (?:the )?(?:total cost|total|cost)(?: in dollars)?$`),'$1*$3'],
    [new RegExp(`^(?:if )?${amount} ([a-z]+) (?:are )?(?:shared|divided|split) equally (?:among|between) ${amount} (?:people|friends|children|kids)[,.]? how many(?: \\2)? (?:does each (?:person|friend|child) get|per person)$`),'$1/$3']
  ];
  for(const [pattern,replacement] of patterns)if(pattern.test(expression))return expression.replace(pattern,replacement);
  return expression;
}

export function localMath(question:string):string|null {
  if(!question.trim()||question.length>1000)return null;
  try {
    let expression=question.toLowerCase().replace(/[’]/g,"'").trim()
      .replace(/^(?:(?:hey(?: (?:thinking )?cap)?|okay|ok|so|please|um|uh|well)[,!\s]+)+/,'')
      .replace(/^(?:can|could|would) you\s+(?:please\s+)?/,'')
      .replace(/^(?:tell me|give me|work out|figure out)\s+/,'')
      .replace(/^(?:(?:what is|what's|what are|what does|how much is|how much are|calculate|compute|evaluate|find)\s+)/,'')
      .replace(/^(?:the )?(?:answer to|result of)\s+/,'')
      .replace(/\s+please[.!?]*$/,'').replace(/[?!.]+$/,'').trim()
      .replace(/\s+(?:equal|equals|come to|work out to)$/,'');
    expression=expression.replace(/\b(?:squre|sqaure|sqare)\b/g,'square')
      .replace(/\bsquareroot\b/g,'square root').replace(/\b(?:devided|divded|divied)\b/g,'divided');
    expression=fractions(expression).replace(numberWords,spokenNumbers);
    expression=arithmeticPhrases(wordProblem(expression))
      .replace(/\b(?:multiplied by|times)\b/g,'*')
      .replace(/\b(?:divided by|over)\b/g,'/')
      .replace(/\b(?:plus|add)\b/g,'+')
      .replace(/\b(?:minus|negative|take away)\b/g,'-')
      .replace(/\b(?:raised to (?:the )?(?:power of )?|to the power (?:of )?)(\d+)(?:st|nd|rd|th)?(?: power)?\b/g,'^$1')
      .replace(/\b(?:raised )?to the (first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)(?: power)?\b/g,(_match,ordinal:string)=>`^${['first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth'].indexOf(ordinal)+1}`)
      .replace(/\bsquared\b/g,'^2').replace(/\bcubed\b/g,'^3')
      .replace(/\b(?:the )?(?:square root|sqrt)(?: of)?\b/g,'sqrt')
      .replace(/\b(?:the )?cube root(?: of)?\b/g,'cbrt')
      .replace(/\b(?:the )?square of\b/g,'square')
      .replace(/\b(?:the )?cube of\b/g,'cube')
      .replace(/\bdouble\s+/g,'2*').replace(/\btriple\s+/g,'3*')
      .replace(/\b(?:percent of|per cent of)\b/g,'%*')
      .replace(/\b(?:percent|per cent)\b/g,'%')
      .replace(/%\s*of\b/g,'%*')
      .replace(/[×]/g,'*').replace(/[÷]/g,'/').replace(/[−]/g,'-')
      .replace(/√/g,'sqrt ')
      .replace(/\*\*/g,'^');
    expression=expression.replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g,value=>value.replace(/,/g,''));
    const tokens=expression.match(/sqrt|cbrt|square|cube|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[()+*/^%\-]|\S/g)??[];
    if(!tokens.length||tokens.length>150||tokens.some(token=>! /^(?:sqrt|cbrt|square|cube|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[()+*/^%\-])$/.test(token)))return null;
    let position=0,operations=0;
    function primary():number {
      const token=tokens[position++];
      let value:number;
      if(token==='(') {
        value=sum();
        if(tokens[position++]!==')')throw new Error('Missing parenthesis');
      }else if(token==='sqrt'||token==='cbrt'||token==='square'||token==='cube') {
        operations++;const operand=unary();
        value=token==='sqrt'?Math.sqrt(operand):token==='cbrt'?Math.cbrt(operand):operand**(token==='square'?2:3);
      }else {
        if(!token||! /^(?:\d|\.)/.test(token))throw new Error('Expected number');
        value=Number(token);
        if(!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER)throw new Error('Number too large');
      }
      check(value);
      while(tokens[position]==='%'){position++;operations++;value/=100;}
      return value;
    }
    function power():number {
      const value=primary();
      if(tokens[position]!=='^')return value;
      position++;operations++;const result=value**unary();check(result);return result;
    }
    function unary():number {
      if(tokens[position]==='+'||tokens[position]==='-') {
        const sign=tokens[position++];return sign==='-'?-unary():unary();
      }
      return power();
    }
    function product():number {
      let value=unary();
      while(tokens[position]==='*'||tokens[position]==='/') {
        const operator=tokens[position++];operations++;const right=unary();
        value=operator==='*'?value*right:value/right;
        check(value);
      }
      return value;
    }
    function sum():number {
      let value=product();
      while(tokens[position]==='+'||tokens[position]==='-') {
        const operator=tokens[position++];operations++;const right=product();
        value=operator==='+'?value+right:value-right;
        check(value);
      }
      return value;
    }
    function check(value:number) {
      if(!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER)throw new Error('Unrepresentable result');
    }
    const result=sum();check(result);
    if(position!==tokens.length||!operations)return null;
    return String(Number.isInteger(result)?result:Number(result.toPrecision(15)));
  }catch {return null;}
}
