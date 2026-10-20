import test from 'node:test';
import assert from 'node:assert/strict';
import {localMath} from '../src/math';

test('local arithmetic handles typed and spoken expressions with precedence',()=>{
  const cases:Record<string,string>={
    '2 + 3 * 4':'14','(2 + 3) * 4':'20','2^3^2':'512','-2^2':'-4','2^-3':'0.125',
    "What's twenty one squared?":'441','What is two plus two?':'4',
    'Hey cap what is one hundred and twenty three minus twenty three?':'100',
    'calculate one thousand two hundred divided by three':'400',
    'two point five times four':'10','What is the square root of 144?':'12',
    'sqrt(16) + 2 cubed':'12','20 percent of 50':'10','20% of 50':'10',
    '0.1 + 0.2':'0.3','1,000 + 2,000':'3000','6 × 7':'42',
    'compute 9 ÷ 2':'4.5','50 percent':'0.5','2 minus 2':'0',
    '9007199254740991 - 0':'9007199254740991'
  };
  for(const [question,expected] of Object.entries(cases))assert.equal(localMath(question),expected,question);
});

test('ambiguous, unsupported and invalid math falls back instead of guessing',()=>{
  for(const question of [
    'What is one?','What time is it?','Explain why 2 + 2 is 4','2 + 2 in Spanish',
    'What is 20 percent off 50 dollars?','two cats plus two dogs','one two plus three',
    '1/0','sqrt(-1)','2^1024','9007199254740992 + 1','2 +','(2 + 3','2(3)',
    '1,00 + 2','process.exit()','2 + 2; alert(1)','2 + 2 = 4','2 + '.repeat(500)
  ])assert.equal(localMath(question),null,question);
});

test('fractions and mixed numbers work in spoken and typed arithmetic',()=>{
  const cases:Record<string,string>={
    '3 over 5':'0.6','three over five':'0.6','three fifths':'0.6',
    'two and a half':'2.5','two and one half plus one':'3.5',
    'two and three quarters times four':'11','2 1/2 + 3 1/4':'5.75',
    'negative two and a half':'-2.5','one-half plus one-quarter':'0.75',
    'a third times three':'1','half of twelve':'6','a quarter of twenty':'5',
    'half plus half':'1','twenty one and a half':'21.5',
    'one hundred and twenty three and a half':'123.5','two and half':'2.5',
    'three quarters of twelve':'9','quarter of twenty':'5','2 and 3 quarters':'2.75',
    'one eighth plus three eighths':'0.5'
  };
  for(const [question,expected] of Object.entries(cases))assert.equal(localMath(question),expected,question);
});

test('common command phrasings, roots and math typos stay local',()=>{
  const cases:Record<string,string>={
    'squre root of 81':'9','What is the sqaure root of 64?':'8',
    'sqrt of 49':'7','square root 36':'6','squareroot of 16':'4','√25':'5',
    'cube root of negative twenty seven':'-3','the square of 7':'49','the cube of 4':'64',
    '20 devided by 4':'5','15 divded by 3':'5',
    'Can you calculate three over five please?':'0.6',
    'Could you please tell me what is six divided by two?':'3',
    'What does two plus two equal?':'4','Give me the sum of two and three':'5',
    'difference between ten and four':'6','product of six and seven':'42',
    'quotient of twenty and five':'4','add five to seven':'12',
    'subtract three from ten':'7','three subtracted from ten':'7',
    'multiply six by seven':'42','divide twenty by four':'5','three divided into twelve':'4',
    '2 raised to the power of 5':'32','2 to the power 3':'8',
    '2 to the third power':'8','2 raised to the fourth power':'16','2 raised to 3':'8',
    'double twelve':'24','triple seven':'21','nine take away four':'5',
    '20 percent off 50':'40','100 increased by 15 percent':'115','100 decreased by 15%':'85',
    'sum of one hundred and five and six':'111',
    'sum of five and one hundred and six':'111',
    'the result of three plus four':'7','What is the answer to 5 times 4?':'20'
  };
  for(const [question,expected] of Object.entries(cases))assert.equal(localMath(question),expected,question);
});

test('explicit single-step word problems return only the numeric answer',()=>{
  const cases:Record<string,string>={
    'If I have five apples and get three more, how many apples do I have?':'8',
    'I have ten apples and give away four. How many are left?':'6',
    'I have 20 dollars and spend 7 dollars, how many dollars do I have left?':'13',
    'If 3 apples cost $2 each, what is the total cost?':'6',
    '12 cookies are shared equally among 4 friends, how many cookies does each friend get?':'3',
    '15 candies split equally between 3 people, how many per person?':'5'
  };
  for(const [question,expected] of Object.entries(cases))assert.equal(localMath(question),expected,question);
  for(const question of [
    'I have 5 apples and get 3 oranges, how many apples do I have?',
    'I have 5 apples and get 3 more, how many oranges do I have?',
    'I have 5 apples and might get 3 more, how many apples do I have?',
    'If 3 apples cost $2 each with tax, what is the total cost?',
    '12 cookies are shared equally among 0 friends, how many cookies does each friend get?',
    'I have 5 apples and give away 2 then buy 3, how many are left?'
  ])assert.equal(localMath(question),null,question);
});
