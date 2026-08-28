import { ShieldAlert } from 'lucide-react'

export function CustomerDocumentTerms() {
  return <aside className="customer-document-terms" aria-label="Document access terms">
    <ShieldAlert aria-hidden="true" />
    <div>
      <header><strong>Document access terms</strong><span>Draft portal terms — legal review required</span></header>
      <p>Electronic file transfer carries inherent security risks. The manufacturer takes reasonable steps intended to prevent malicious files from being shared, but cannot guarantee that every document is free of malware, malicious code, or other harmful content.</p>
      <p>To the extent permitted by applicable law, the manufacturer is not responsible for loss or damage arising from access to, download of, or use of a document. You are responsible for maintaining appropriate security controls, inspecting downloaded files, and deciding whether to open them. You access and use portal documents at your own risk.</p>
    </div>
  </aside>
}
