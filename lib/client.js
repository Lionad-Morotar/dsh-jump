window.__ModuleLoader__.load({
  id: "dsh-jump",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
"use strict";var J=Object.defineProperty;var de=Object.getOwnPropertyDescriptor;var pe=Object.getOwnPropertyNames;var me=Object.prototype.hasOwnProperty;var fe=(e,t)=>{for(var n in t)J(e,n,{get:t[n],enumerable:!0})},ge=(e,t,n,i)=>{if(t&&typeof t=="object"||typeof t=="function")for(let o of pe(t))!me.call(e,o)&&o!==n&&J(e,o,{get:()=>t[o],enumerable:!(i=de(t,o))||i.enumerable});return e};var ye=e=>ge(J({},"__esModule",{value:!0}),e);var Ve={};fe(Ve,{boot:()=>ze,clientPlugin:()=>re,default:()=>We});module.exports=ye(Ve);var I=["Escape","Tab","Enter"," ","Backspace","Delete","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Dead","CapsLock","AltGraph","Unidentified","Meta","Control","Alt","Shift","OS",""];function C(e){return e.meta||e.alt||e.ctrl||e.shift}function he(e){return e.length>1&&!I.includes(e)}var be={ctrl:"\u2303",alt:"\u2325",shift:"\u21E7",meta:"\u2318"},xe={ctrl:"Ctrl",alt:"Alt",shift:"Shift",meta:"Meta"},ve={" ":"Space",Escape:"Esc",Enter:"\u21A9",Tab:"\u21E5",Backspace:"\u232B",Delete:"\u2326",ArrowUp:"\u2191",ArrowDown:"\u2193",ArrowLeft:"\u2190",ArrowRight:"\u2192"},we={" ":"Space"};function S(e){let t=e.trim().toLowerCase();return t===""||/mac|darwin|iphone|ipad/.test(t)?"macos":"other"}function g(e){let t=e==="macos"?{meta:!0,ctrl:!1}:{meta:!1,ctrl:!0};return{click:{key:"h",alt:!1,shift:!1,...t},focus:{key:"u",alt:!1,shift:!1,...t}}}function _(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function E(e,t){return e[t]===!0||t==="ctrl"&&e.control===!0}function k(e,t,n="macos"){if(typeof e=="string")return e.length!==1?t:{key:e.toLowerCase(),meta:n==="macos",alt:!1,ctrl:n!=="macos",shift:!1};if(!_(e))return t;let i=e.key;return typeof i!="string"||i.length===0?t:{key:i.length===1?i.toLowerCase():i,meta:E(e,"meta"),alt:E(e,"alt"),ctrl:E(e,"ctrl"),shift:E(e,"shift")}}function T(e,t="macos"){let n=g(t),i=_(e)?e:{};return{click:k(i.click,n.click,t),focus:k(i.focus,n.focus,t)}}function w(e,t){return e.key.toLowerCase()===t.key.toLowerCase()&&e.meta===t.meta&&e.alt===t.alt&&e.ctrl===t.ctrl&&e.shift===t.shift}function M(e,t){return I.includes(e.key)?"reserved-key":!e.meta&&!e.alt&&!e.ctrl&&!he(e.key)?"no-modifier":t.some(i=>w(i,e))?"duplicate":null}function y(e,t){return e.isComposing?!1:e.key.toLowerCase()===t.key.toLowerCase()&&e.metaKey===t.meta&&e.altKey===t.alt&&e.ctrlKey===t.ctrl&&e.shiftKey===t.shift}function Ee(e,t){let i=(t==="macos"?ve:we)[e];return i!==void 0?i:e.length===1?e.toUpperCase():e}function K(e,t){let i=["ctrl","alt","shift","meta"].filter(a=>e[a]).map(a=>t==="macos"?be[a]:xe[a]);return i.push(Ee(e.key,t)),t==="macos"?i.join(""):i.join("+")}var h=["a","s","d","f","g","h","j","k","l"],ke=["button","link","tab","treeitem","option","menuitem","menuitemcheckbox","menuitemradio","checkbox","radio","switch","slider","spinbutton"],A=["textbox","searchbox"],Se=["a[href]","area[href]","button","input:not([type=hidden])","select","textarea","summary","[tabindex]","[contenteditable]:not([contenteditable=false])",...ke.map(e=>`[role=${e}]`),...A.map(e=>`[role=${e}]`)].join(", "),H={candidateSelector:Se};function*Re(e=1){if(e<=1){yield*h;return}let t=[...h];for(let n=1;n<e;n+=1){let i=[];for(let o of t){let a=o[o.length-1];if(a===void 0)break;for(let r of h)r!==a&&i.push(o+r);i.push(o+a)}t=i}yield*t}var N=h.length;function Be(e){let t=1,n=N;for(;e>n;)t+=1,n*=N;return t}function G(e,t,n){let i=[];for(let r of e()){let s=r.getBoundingClientRect();s.width>0&&s.height>0&&s.x<t.width&&s.x+s.width>0&&s.y<t.height&&s.y+s.height>0&&n.isVisible(r)&&i.push({element:r,rect:{x:s.x,y:s.y,w:s.width,h:s.height}})}let o=i.filter(({element:r})=>!i.some(s=>s.element!==r&&r.contains(s.element))),a=Re(Be(o.length));return o.map(r=>{let s=a.next();if(s.done)throw new Error("dsh-jump: label space exhausted");return{element:r.element,label:s.value,rect:r.rect}})}function Y(){return{mode:"idle",pending:""}}function j(e){e.mode="idle",e.pending=""}function z(e,t,n,i){if(e.mode==="idle")return y(t,i.click)?(e.mode="click",e.pending="",{type:"activate-click"}):y(t,i.focus)?(e.mode="focus",e.pending="",{type:"activate-focus"}):{type:"ignore"};if(t.key==="Escape")return j(e),{type:"exit"};if(t.metaKey||t.ctrlKey||t.altKey)return j(e),{type:"exit"};if(t.shiftKey||t.isComposing)return{type:"ignore"};if(y(t,i.click)||y(t,i.focus))return j(e),{type:"exit"};if(!h.includes(t.key))return e.pending="",{type:"ignore"};let o=e.pending+t.key;return n.includes(o)?(e.pending="",{type:"label",key:t.key}):n.some(a=>a.length>o.length&&a.startsWith(o))?(e.pending=o,{type:"label",key:t.key}):(e.pending="",{type:"ignore"})}function W(e={}){let t=e.doc??globalThis.document,n=e.viewport??(()=>({width:globalThis.innerWidth,height:globalThis.innerHeight})),i;function o(){if(i!==void 0)return i;let r=t.createElement("div");return r.dataset.dshJumpOverlay="",r.style.cssText="position:fixed;inset:0;z-index:2147483647;pointer-events:none",t.documentElement.append(r),i=r,r}function a(r,s){let l=t.createElement("div");l.dataset.jumpLabel=r.label,l.textContent=r.label;let{width:c,height:u}=n(),p=Math.min(Math.max(r.rect.x,0),Math.max(c-24,0)),d=Math.min(Math.max(r.rect.y,0),Math.max(u-16,0));return l.style.cssText="position:fixed;left:"+String(Math.round(p))+"px;top:"+String(Math.round(d))+"px;padding:1px 3px;background:#ffd60a;color:#000;border-radius:3px;font:11px/1.3 ui-monospace,Menlo,monospace;pointer-events:none;opacity:"+(s?"1":"0.3"),l}return{render(r,s=""){o().replaceChildren(...r.map(c=>a(c,c.label.startsWith(s))))},destroy(){i?.remove(),i=void 0}}}var Je=new Set(["text","search","url","tel","email","password","number","date","month","week","time","datetime-local"]),Ce=new Set(["TEXTAREA"]);function V(e){let t=e.getAttribute("contenteditable");return t===null?!1:t.trim().toLowerCase()!=="false"}function L(e){if(V(e))return"focus";let t=e.tagName;if(t==="INPUT"){let i=(e.getAttribute("type")??"text").trim().toLowerCase();return Je.has(i)?"focus":"click"}if(Ce.has(t))return"focus";let n=e.getAttribute("role");return n!==null&&A.includes(n.trim().toLowerCase())?"focus":"click"}function F(e){if(e===null)return!1;if(L(e)==="focus")return!0;for(let t=e;t!==null;t=t.parentElement)if(V(t))return!0;return!1}function Te(e){let t=e;if(typeof t.checkVisibility=="function")return t.checkVisibility();let n=t.ownerDocument?.defaultView;return t.offsetParent!==null||n?.getComputedStyle(t).position==="fixed"}function Ke(e,t,n){let i=e.ownerDocument?.defaultView;if(i==null)return;let o=(s,l)=>new i.MouseEvent(s,{bubbles:!0,cancelable:!0,clientX:t,clientY:n,button:0,buttons:l}),a=i.PointerEvent,r=(s,l)=>a===void 0?o(s,l):new a(s,{bubbles:!0,cancelable:!0,clientX:t,clientY:n,button:0,buttons:l,pointerId:1,pointerType:"mouse",isPrimary:!0});e.dispatchEvent(r("pointerdown",1)),e.dispatchEvent(o("mousedown",1)),e.dispatchEvent(r("pointerup",0)),e.dispatchEvent(o("mouseup",0)),e.dispatchEvent(o("click",0))}function Ae(e,t){let n=e;if(typeof n.focus!="function"||t.activeElement===e||(n.focus(),t.activeElement!==e))return;let i=t.getSelection?.()??null;if(i===null)return;let o=t.createRange();o.selectNodeContents(e),o.collapse(!1),i.removeAllRanges(),i.addRange(o)}function je(){return globalThis.navigator?.platform??""}function q(e={}){let t=e.window??globalThis,n={...H,...e.config},i=e.isVisible??Te,o=e.platform??S(je()),a=g(o),r=e.bindings??{get:()=>a},s=W({doc:t.document,viewport:()=>({width:t.innerWidth,height:t.innerHeight})});function l(){let c=G(()=>Array.from(t.document.querySelectorAll(n.candidateSelector)),{width:t.innerWidth,height:t.innerHeight},{isVisible:i});return s.render(c),c}return{apply(){let c=Y(),u=[],p=d=>{let m=r.get(),R=y(d,m.click)&&!C(m.click)||y(d,m.focus)&&!C(m.focus);if(c.mode==="idle"&&R&&F(t.document.activeElement))return;let b=c.pending,B={key:d.key,metaKey:d.metaKey,ctrlKey:d.ctrlKey,altKey:d.altKey,shiftKey:d.shiftKey,isComposing:d.isComposing},se=c.mode!=="idle",x=z(c,B,u.map(v=>v.label),m);if((se||x.type!=="ignore")&&(d.preventDefault(),d.stopPropagation()),x.type==="ignore"){c.pending!==b&&s.render(u,c.pending);return}if(x.type==="activate-click"||x.type==="activate-focus"){u=l();return}if(x.type==="exit"){u=[],s.destroy();return}if(c.pending!==b&&s.render(u,c.pending),c.pending!=="")return;let ae=b+x.key,f=u.find(v=>v.label===ae);u=[],s.destroy();let ce=c.mode;if(c.mode="idle",f===void 0)return;let le=f.rect.x+f.rect.w/2,ue=f.rect.y+f.rect.h/2;if(L(f.element)==="focus")Ae(f.element,t.document);else if(ce==="click")Ke(f.element,le,ue);else{let v=f.element;typeof v.focus=="function"&&v.focus()}};return t.addEventListener("keydown",p,{capture:!0}),()=>{t.removeEventListener("keydown",p,{capture:!0}),s.destroy(),u=[]}}}}var Le={navLabel:"\u8DF3\u8DC3\u5BFC\u822A",title:"\u8DF3\u8DC3\u5BFC\u822A",description:"\u6309\u4E0B\u7EC4\u5408\u952E\u540E\uFF0C\u7528\u5B57\u6BCD\u6807\u7B7E\u9009\u4E2D\u8981\u70B9\u51FB\u6216\u805A\u7126\u7684\u76EE\u6807\u3002",clickTitle:"\u70B9\u51FB\u6A21\u5F0F",clickDescription:"\u9009\u4E2D\u540E\u89E6\u53D1\u4E00\u6B21\u5B8C\u6574\u7684\u70B9\u51FB\u3002",focusTitle:"\u805A\u7126\u6A21\u5F0F",focusDescription:"\u9009\u4E2D\u540E\u53EA\u628A\u7126\u70B9\u79FB\u8FC7\u53BB\u3002",recording:"\u6309\u4E0B\u5FEB\u6377\u952E",recordingHint:"Esc \u53D6\u6D88",reset:"\u6062\u590D\u9ED8\u8BA4",clickName:"\u70B9\u51FB\u6A21\u5F0F\u7684\u5FEB\u6377\u952E",focusName:"\u805A\u7126\u6A21\u5F0F\u7684\u5FEB\u6377\u952E",bareNote:"Insert\u3001F1 \u8FD9\u7C7B\u4E0D\u4EA7\u751F\u5B57\u7B26\u7684\u952E\u53EF\u4EE5\u4E0D\u914D\u4FEE\u9970\u952E\uFF1B\u5728\u8F93\u5165\u6846\u91CC\u5B83\u4EEC\u4ECD\u5F52\u8F93\u5165\u6846\u3002",issues:{"no-modifier":"\u5355\u4E2A\u5B57\u7B26\u7684\u952E\u9700\u8981\u2318\u6216\u2303\u6216\u2325\uFF0C\u4E0D\u4EA7\u751F\u5B57\u7B26\u7684\u952E\uFF08Insert\u3001F1 \u7B49\uFF09\u53EF\u4EE5\u76F4\u63A5\u7528","reserved-key":"\u8FD9\u4E2A\u952E\u88AB\u754C\u9762\u5360\u7528\u4E86",duplicate:"\u5DF2\u7ECF\u5206\u914D\u7ED9\u53E6\u4E00\u4E2A\u6A21\u5F0F"}},Pe={navLabel:"Jump navigation",title:"Jump navigation",description:"Press a shortcut, then type a label to click or focus a target.",clickTitle:"Click mode",clickDescription:"The selected target receives a full click.",focusTitle:"Focus mode",focusDescription:"The selected target only receives focus.",recording:"Press a shortcut",recordingHint:"Esc to cancel",reset:"Restore default",clickName:"Click-mode shortcut",focusName:"Focus-mode shortcut",bareNote:"Keys that print nothing, such as Insert or F1, can be bound bare; while a text field has focus they still belong to it.",issues:{"no-modifier":"A single-character key needs \u2318, \u2303 or \u2325; a key that prints nothing (Insert, F1) can be used bare","reserved-key":"That key belongs to the interface",duplicate:"Already bound to the other mode"}};function P(e){return e.toLowerCase().startsWith("en")?Pe:Le}var De=new Set(["Meta","Control","Alt","Shift","AltGraph","CapsLock","OS"]);function U(e,t,n){if(e.key==="Escape")return{status:"cancel"};if(De.has(e.key)||e.isComposing)return{status:"pending"};let i=k({key:e.key,meta:e.metaKey,alt:e.altKey,ctrl:e.ctrlKey,shift:e.shiftKey},{key:e.key,meta:!1,alt:!1,ctrl:!1,shift:!1},n),o=M(i,t);return o!==null?{status:"rejected",issue:o}:{status:"accepted",binding:i}}function Oe(e,t){return[t==="click"?e.focus:e.click]}function X(e){let{store:t,platform:n}=e,i=new Set,o={bindings:t.get(),recording:null,issue:null},a=r=>{if(!(r.bindings===o.bindings&&r.recording===o.recording&&r.issue===o.issue)){o=r;for(let s of i)s(o)}};return t.subscribe(r=>{a({...o,bindings:r,issue:null})}),{getState:()=>o,begin(r){a({...o,recording:r,issue:null})},press(r){let s=o.recording;if(s===null)return"idle";let l=U(r,Oe(o.bindings,s),n);return l.status==="pending"?"pending":l.status==="cancel"?(a({...o,recording:null,issue:null}),"cancelled"):l.status==="rejected"?(a({...o,issue:l.issue}),"rejected"):(t.set({...o.bindings,[s]:l.binding}),a({...o,bindings:t.get(),recording:null,issue:null}),"saved")},reset(){t.reset(),a({bindings:t.get(),recording:null,issue:null})},resetAction(r){let s=g(n),l=r==="click"?"focus":"click",c={...o.bindings,[r]:s[r]};w(c[r],c[l])&&(c[l]=s[l]),t.set(c),a({bindings:t.get(),recording:null,issue:null})},subscribe(r){return i.add(r),()=>{i.delete(r)}}}}function $(e,t,n){let i=e.useRef(n);i.current=n,e.useEffect(()=>{if(t===null)return;let o=r=>{r.preventDefault(),r.stopPropagation(),i.current(r)},a=globalThis.document;return a.addEventListener("keydown",o,{capture:!0}),()=>{a.removeEventListener("keydown",o,{capture:!0})}},[t])}var Ie=`
[data-dsh-jump-page] {
  display: flex;
  flex-direction: column;
  width: 100%;
  color: var(--dsw-alias-label-primary);
}
[data-dsh-jump-page] [data-dsh-jump-head] {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 8px;
}
[data-dsh-jump-page] [data-dsh-jump-heading] {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
}
[data-dsh-jump-page] [data-dsh-jump-lede] {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
[data-dsh-jump-page] [data-dsh-jump-mode] {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 60px;
  padding: 16px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
[data-dsh-jump-page] [data-dsh-jump-mode]:last-of-type {
  border-bottom: none;
}
[data-dsh-jump-page] [data-dsh-jump-text] {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 4px;
  min-width: 0;
}
[data-dsh-jump-page] [data-dsh-jump-title] {
  font-size: 14px;
  line-height: 22px;
}
[data-dsh-jump-page] [data-dsh-jump-description] {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
[data-dsh-jump-page] [data-dsh-jump-actions] {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
}
[data-dsh-jump-page] [data-dsh-jump-chord] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 92px;
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  cursor: pointer;
  white-space: nowrap;
}
[data-dsh-jump-page] [data-dsh-jump-chord]:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
[data-dsh-jump-page] [data-dsh-jump-chord][data-recording] {
  outline: 1px solid var(--dsw-alias-label-primary);
  outline-offset: -1px;
}
[data-dsh-jump-page] [data-dsh-jump-reset] {
  height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
[data-dsh-jump-page] [data-dsh-jump-reset]:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
[data-dsh-jump-page] [data-dsh-jump-reset]:disabled {
  cursor: default;
  opacity: 0.45;
}
[data-dsh-jump-page] [data-dsh-jump-issue] {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
[data-dsh-jump-page] [data-dsh-jump-note] {
  margin: 0;
  padding-top: 12px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
`,Z="dsh-jump/page.css";function ee(e){let t=`style[data-plugin-css=${JSON.stringify(Z)}]`;if(e.querySelector(t)!==null)return()=>{};let n=e.createElement("style");return n.dataset.plugin="dsh-jump",n.dataset.pluginCss=Z,n.textContent=Ie,e.head.append(n),()=>n.remove()}function Q(e){let{React:t,action:n,controller:i,platform:o,copy:a,title:r,description:s,name:l}=e,c=t.useSyncExternalStore(m=>i.subscribe(()=>m()),()=>i.getState()),u=c.recording===n,p=K(c.bindings[n],o),d=K(g(o)[n],o);return t.createElement("div",{"data-dsh-jump-mode":n},t.createElement("div",{"data-dsh-jump-text":""},t.createElement("span",{"data-dsh-jump-title":""},r),t.createElement("p",{"data-dsh-jump-description":""},u?a.recordingHint:s)),t.createElement("div",{"data-dsh-jump-actions":""},t.createElement("button",{type:"button","data-dsh-jump-chord":n,"data-recording":u?"":void 0,"aria-label":l,"aria-keyshortcuts":p,onClick:()=>{i.begin(n)}},u?a.recording:p),t.createElement("button",{type:"button","data-dsh-jump-reset":n,disabled:p===d,onClick:()=>{i.resetAction(n)}},a.reset)))}function te(e){let{React:t,controller:n,platform:i,copy:o}=e,a=t.useSyncExternalStore(r=>n.subscribe(()=>r()),()=>n.getState());return $(t,a.recording,r=>{n.press({key:r.key,metaKey:r.metaKey,ctrlKey:r.ctrlKey,altKey:r.altKey,shiftKey:r.shiftKey,isComposing:r.isComposing})}),t.createElement("div",{"data-dsh-jump-page":""},t.createElement("div",{"data-dsh-jump-head":""},t.createElement("h3",{"data-dsh-jump-heading":""},o.title),t.createElement("p",{"data-dsh-jump-lede":""},o.description)),Q({React:t,action:"click",controller:n,platform:i,copy:o,title:o.clickTitle,description:o.clickDescription,name:o.clickName}),Q({React:t,action:"focus",controller:n,platform:i,copy:o,title:o.focusTitle,description:o.focusDescription,name:o.focusName}),a.issue===null?null:t.createElement("p",{"data-dsh-jump-issue":"",role:"status"},o.issues[a.issue]),t.createElement("p",{"data-dsh-jump-note":""},o.bareNote))}var D="dsh-jump:bindings:v1";function _e(e,t){return w(e.click,t.click)&&w(e.focus,t.focus)}function Me(){try{return globalThis.localStorage??null}catch{return null}}function ne(e){let t=g(e.platform),n=e.storage===void 0?Me():e.storage,i=new Set,o=()=>{if(n===null)return t;try{let s=n.getItem(D);return s===null?t:T(JSON.parse(s),e.platform)}catch{return t}},a=o(),r=s=>{if(!_e(a,s)){a=s;for(let l of i)l(a)}};return{get:()=>a,set(s){if(r(T(s,e.platform)),n!==null)try{n.setItem(D,JSON.stringify(a))}catch{}},reset(){if(r(t),n!==null)try{n.removeItem(D)}catch{}},reload(){r(o())},subscribe(s){return i.add(s),()=>{i.delete(s)}}}}var ie="settings.section",He="jump",Ne=25;function oe(e){let{ctx:t,platform:n,React:i,config:o}=e,a=e.store??ne({platform:n}),r=q({config:o,bindings:a,platform:n,window:e.window}),s=[r.apply()];return i!==null&&s.push(t.inject(["slots"],l=>{let c=l.get("slots");if(c===void 0)return;let u=l.get("locale"),p=X({store:a,platform:n}),d=()=>P(u?.getSnapshot().active??"zh").navLabel,m=()=>te({React:i,controller:p,platform:n,copy:P(u?.getSnapshot().active??"zh")}),R=c.inject(ie,()=>c.register({name:ie,id:He,order:Ne,label:d},m)),b=e.document??globalThis.document,B=b===void 0?void 0:ee(b);return()=>{R(),B?.()}})),{store:a,app:r,dispose(){for(;s.length>0;)s.pop()?.()}}}var O=null;function Ge(){return S(globalThis.navigator?.platform??"")}function Ye(){if(O===null)return null;let e=O("react");for(let t of["createElement","useEffect","useRef","useSyncExternalStore"])if(typeof e?.[t]!="function")return null;return e}var re={name:"dsh-jump",inject:[],apply(e,t){let n=oe({ctx:e,platform:Ge(),React:Ye(),config:t});return()=>n.dispose()}};function ze(e){O=e}var We=re;

module.exports.boot(require);
    return module.exports.default ?? module.exports;
  }
});
