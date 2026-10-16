/** Keep citation metadata in the sources panel, out of speech and conversation history. */
export function spokenText(text:string,sources:{url:string;title:string}[]=[]):string {
  const citationLabels=new Set(sources.map(source=>source.title.trim().toLowerCase()));
  return text
    .replace(/cite[^]*|【[^】]*】/g,'')
    .replace(/\[([^\]]+)\]\(https?:\/\/(?:[^\s()]|\([^\s()]*\))*\)/gi,(_link,label:string)=>{
      const name=label.trim();
      return /^(?:www\.)?[\w-]+(?:\.[\w-]+)+(?:\/\S*)?$/.test(name)||/^(?:source\s*\d*|\d+)$/i.test(name)||citationLabels.has(name.toLowerCase())?'':name;
    })
    .replace(/<?https?:\/\/[^\s<>()]+>?/gi,'')
    .replace(/\(\s*\)|\[\s*\]/g,'')
    .replace(/\s+([.,!?;:])/g,'$1')
    .replace(/\s+/g,' ').trim();
}
