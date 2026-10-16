export const SETUP_CSS = `
* { box-sizing: border-box; }
body { margin: 0; background: #f5f6f8; color: #20242b; font: 15px/1.5 'Segoe UI', sans-serif; }
button, input, textarea, select { font: inherit; }
button, .button { cursor: pointer; display: inline-block; border: 1px solid #cbd1db; background: white; border-radius: 8px; padding: 10px 15px; color: #293849; text-decoration: none; font-weight: 550; }
button:hover, .button:hover { background: #eef3fa; border-color: #91a7c6; }
button:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 3px solid #96bbff; outline-offset: 2px; }
button:disabled { cursor: progress; opacity: .65; }
.primary { background: #285caa; border-color: #285caa; color: white; }
.primary:hover { background: #204d91; color: white; }
.stop { color: #9b3737; }
a { color: #285caa; }
main { max-width: 790px; margin: auto; padding: 28px 22px 40px; }
header { margin-bottom: 18px; } h1 { margin: 0; font-size: 26px; letter-spacing: -.6px; }
h2 { font-size: 18px; margin: 0; } p { margin: 5px 0 14px; color: #667080; }
header p { margin-top: 3px; }
.servicebar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 12px; margin-bottom: 14px; }
.servicebar span, .listen-status { display: flex; align-items: center; gap: 7px; }
.servicebar button { padding: 5px 9px; font-size: 12px; margin-left: auto; }
i { display: inline-block; width: 8px; height: 8px; background: #aab2bd; border-radius: 100%; flex-shrink: 0; } i.good { background: #398153; }
.feedback { position: sticky; top: 8px; z-index: 10; background: #eaf0fa; border-left: 3px solid #789bcf; padding: 11px 14px; color: #314b70; font-size: 13px; margin-bottom: 18px; border-radius: 5px; box-shadow: 0 2px 8px #1d35550b; }
.warning { background: #fff0e8; border: 1px solid #e5bbaa; padding: 12px; margin-bottom: 14px; border-radius: 8px; color: #8c3c24; }.warning button { margin-left: 12px; padding: 4px 9px; }
.step { background: white; border: 1px solid #dce1e8; padding: 22px; border-radius: 12px; margin: 0 0 16px; scroll-margin-top: 16px; }
.step-title { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px; }.step-title p { font-size: 13px; margin: 3px 0 0; }.step-title > div { flex: 1; }
.number { border-radius: 50%; width: 28px; height: 28px; background: #eaf0fa; color: #285caa; display: grid; place-items: center; flex-shrink: 0; }
.badge { font-size: 11px; background: #f0f2f5; color: #687487; padding: 4px 8px; border-radius: 6px; white-space: nowrap; }.badge.done { background: #e9f4ec; color: #357547; }
.actions { display: flex; gap: 9px; align-items: center; flex-wrap: wrap; margin-top: 12px; }.hint { font-size: 12px; color: #748092; margin: 10px 0 0; line-height: 1.6; }
.signin { border: 1px solid #b6c9e6; background: #f5f8ff; padding: 14px; margin-top: 14px; border-radius: 8px; }.signin p { font-size: 13px; margin: 10px 0 0; }
.account { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 14px; overflow-wrap: anywhere; }
label { display: block; color: #536174; font-size: 12px; font-weight: 600; margin-bottom: 6px; }
textarea, input, select { background: #fff; color: #293344; width: 100%; min-width: 0; border: 1px solid #cbd2dd; border-radius: 7px; padding: 10px 12px; }
textarea { font: 13px/1.6 'Segoe UI',sans-serif; resize: vertical; min-height: 150px; }
select { margin-bottom: 12px; }.inline { display: flex; align-items: stretch; gap: 9px; }.inline input, .inline select { flex: 1; margin: 0; }.inline button { flex-shrink: 0; }
.model { margin-top: 16px; }.prerequisite { background: #f5f6f9; border-radius: 6px; color: #69778a; padding: 10px 12px; font-size: 12px; margin-bottom: 16px; }
.mode-grid { display: grid; grid-template-columns: .65fr 1.2fr 1fr; gap: 8px; margin: 20px 0 14px; }.mode-grid button { text-align: left; font-size: 13px; padding: 12px; }.mode-grid small { display: block; font-size: 11px; font-weight: 400; color: #778293; margin-top: 4px; }.mode-grid .selected { background: #edf3fd; border: 2px solid #799bcf; padding: 11px; }
.listen-status { font-size: 13px; color: #4d6178; margin: 18px 0 12px; }.output { background: #f7f8fa; border-radius: 8px; padding: 15px; }.output label { margin: 0 0 5px; }.output > div { font-size: 14px; min-height: 24px; overflow-wrap: anywhere; }.output label:nth-of-type(2) { margin-top: 16px; }.output .answer { font-size: 19px; color: #243650; }
.text-button { border: 0; background: transparent; padding: 10px 0 0; color: #64758c; font-size: 12px; font-weight: 400; }.text-button:hover { background: transparent; text-decoration: underline; }
details { margin-top: 16px; border-top: 1px solid #e7eaf0; padding-top: 12px; }summary { cursor: pointer; font-size: 12px; color: #61738c; }details[open] summary { margin-bottom: 14px; }.debug { margin: 20px 4px; }.check { display: flex; gap: 8px; align-items: center; margin: 12px 0; }.check input { width: auto; }.turn { border-top: 1px solid #dce1e8; margin-top: 12px; padding-top: 12px; font-size: 13px; }
footer { font-size: 11px; color: #8590a0; margin: 18px 4px 0; }
@media(max-width: 540px) { main { padding: 20px 14px; }.step { padding: 17px; }.step-title { gap: 9px; }.badge { display: none; }.mode-grid { grid-template-columns: 1fr; }.mode-grid button small { margin: 0; }.inline { flex-wrap: wrap; }.inline input, .inline select { flex-basis: 100%; }.inline button { width: 100%; }.servicebar { gap: 9px; } }
`;
