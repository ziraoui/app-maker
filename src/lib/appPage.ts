/**
 * The `appData` object every generated app is told about, put in front of
 * the app's own HTML. Published, it calls the app's data store over HTTP;
 * in the preview it keeps records inside the frame until the frame reloads.
 */
const REMOTE = `(function(){var base=__BASE__;
function req(method,path,body){return fetch(base+path,{method:method,headers:body===undefined?{}:{"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)}).then(function(r){
if(r.status===204)return null;return r.json().catch(function(){return null}).then(function(j){if(!r.ok)throw new Error((j&&j.error)||("Request failed ("+r.status+")"));return j})})}
function c(n){return "/"+encodeURIComponent(n)}
window.appData={list:function(n){return req("GET",c(n)).then(function(j){return j.records})},
add:function(n,d){return req("POST",c(n),d)},update:function(n,id,d){return req("PUT",c(n)+"/"+encodeURIComponent(id),d)},
remove:function(n,id){return req("DELETE",c(n)+"/"+encodeURIComponent(id)).then(function(){})}};})();`;

const LOCAL = `(function(){var store={};var n=0;
function col(name){return store[name]||(store[name]=[])}
function copy(v){return JSON.parse(JSON.stringify(v))}
window.appData={list:function(name){return Promise.resolve(copy(col(name)))},
add:function(name,data){var at=new Date().toISOString();var r={id:"preview-"+(++n),data:copy(data),createdAt:at,updatedAt:at};col(name).push(r);return Promise.resolve(copy(r))},
update:function(name,id,data){var r=col(name).find(function(x){return x.id===id});if(!r)return Promise.reject(new Error("Not found"));r.data=copy(data);r.updatedAt=new Date().toISOString();return Promise.resolve(copy(r))},
remove:function(name,id){var l=col(name);var i=l.findIndex(function(x){return x.id===id});if(i<0)return Promise.reject(new Error("Not found"));l.splice(i,1);return Promise.resolve()}};})();`;

function inject(html: string, script: string) {
  const tag = `<script>${script}</script>`;
  const head = /<head[^>]*>/i.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + tag + html.slice(at);
  }
  return tag + html;
}

/** For a published app: `dataUrl` is the absolute base of its data store. */
export function publishedPage(html: string, dataUrl: string) {
  const base = JSON.stringify(dataUrl).replace(/</g, "\\u003c");
  return inject(html, REMOTE.replace("__BASE__", base));
}

/** For the preview and the full-size view: records live only in the frame. */
export function previewPage(html: string) {
  return inject(html, LOCAL);
}

/** Served pages run in an opaque origin, apart from the app and each other. */
export const SANDBOX = "allow-scripts allow-forms allow-modals allow-popups";
export const SANDBOX_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "content-security-policy": `sandbox ${SANDBOX}`,
  "x-content-type-options": "nosniff",
  "cache-control": "no-store",
};
