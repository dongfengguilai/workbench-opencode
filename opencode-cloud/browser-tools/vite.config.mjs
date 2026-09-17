// Only the fixed web root is published, including its locked React dependencies.
export default {root:'/workspace/project/web',esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:5173,strictPort:true,allowedHosts:['localhost','127.0.0.1'],fs:{strict:true,allow:['/workspace/project/web'],deny:['**/.env','**/.env.*','**/*.{pem,key,p12,pfx}','**/.git/**','**/.workbench-artifacts/**']}}};
