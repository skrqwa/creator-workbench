import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { createHash } from 'node:crypto';
import { webUrl, text } from './storage.mjs';

const parser = new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@',processEntities:false,trimValues:true});
function plain(value) {
  const raw=typeof value==='object' ? value?.['#text'] : value;
  return String(raw ?? '').replace(/<[^>]*>/g,'').replace(/&(amp|lt|gt|quot|apos);/g,(_,name)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[name])).trim();
}
export function feedUrl(input) {
  const q=text(input,2400).trim();
  if (/^[\w.-]+\/[\w.-]+$/.test(q)) return 'https://github.com/'+q+'/releases.atom';
  const val=webUrl(q);
  if (!val) throw new Error('请输入 RSS/Atom 地址或 GitHub 的 owner/repo');
  const u=new URL(val);
  if (u.hostname==='github.com' && /^\/[\w.-]+\/[\w.-]+(?:\/releases)?\/?$/.test(u.pathname)) return u.origin+'/'+u.pathname.split('/').filter(Boolean).slice(0,2).join('/')+'/releases.atom';
  return val;
}
export function makeTopic(title,url,source,publishedAt='') {
  const link=webUrl(url);const name=text(title,500).trim();
  if(!link || !name) throw new Error('选题需要有效的标题和原文链接');
  return {id:createHash('sha256').update(link).digest('hex').slice(0,20),title:name,url:link,source:text(source,500)||new URL(link).hostname,publishedAt:publishedAt && Number.isFinite(Date.parse(publishedAt)) ? new Date(publishedAt).toISOString() : '',addedAt:new Date().toISOString()};
}
export function parseFeed(xml, base) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml)!==true) throw new Error('该地址未返回有效的 RSS/Atom 文档');
  const doc=parser.parse(xml);
  const feed=doc.feed || doc.rss?.channel || doc['rdf:RDF'];
  if (!feed) throw new Error('未找到 RSS/Atom，请使用订阅地址');
  const entries=[].concat(feed.entry || feed.item || []);
  const source=plain(feed.title) || new URL(base).hostname;
  const topics=[];
  for(const e of entries.slice(0,200)) {
    const links=[].concat(e.link || []);
    const selected=links.find(l=>typeof l==='string' || l['@rel']==='alternate' || !l['@rel']);
    const href=typeof selected==='string'? selected : selected?.['@href'] || plain(e.guid);
    if(!href || !plain(e.title)) continue;
    let url;try{url=new URL(plain(href),base).href;}catch{continue;}
    if(webUrl(url)) topics.push(makeTopic(plain(e.title),url,source,plain(e.published || e.pubDate || e.updated)));
  }
  return topics;
}
export async function fetchTopics(input, fetcher=fetch) {
  const url=feedUrl(input);
  const response=await fetcher(url,{headers:{Accept:'application/atom+xml, application/rss+xml, application/xml, text/xml'},signal:AbortSignal.timeout(20000)});
  if(!response.ok) throw new Error('订阅源返回 HTTP '+response.status);
  const chunks=[];let size=0;
  for await(const bytes of response.body) {size+=bytes.length;if(size>4*1024*1024)throw new Error('订阅文件超过 4 MiB');chunks.push(bytes);}
  return parseFeed(Buffer.concat(chunks).toString('utf8'),response.url || url);
}
export function mergeTopics(old,added) {
  const previous = new Map(old.map(item=>[item.id,item]));
  const merged = new Map();
  for (const item of added) merged.set(item.id,{...item,addedAt:previous.get(item.id)?.addedAt || item.addedAt});
  for (const item of old) if (!merged.has(item.id)) merged.set(item.id,item);
  return [...merged.values()].slice(0,1000);
}
