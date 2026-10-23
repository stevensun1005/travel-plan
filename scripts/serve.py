"""Preview a generated static page and print the actual available loopback URL."""
import argparse
import functools
import http.server
from pathlib import Path

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('folder');parser.add_argument('--port',type=int,default=4173);args=parser.parse_args()
    folder=Path(args.folder).resolve()
    if not (folder/'index.html').is_file():parser.error('No index.html in the selected directory')
    handler=functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(folder))
    for port in range(args.port,args.port+30):
        try:server=http.server.ThreadingHTTPServer(('127.0.0.1',port),handler);break
        except OSError:continue
    else:parser.error('No available preview port')
    print(f'Travel plan preview: http://127.0.0.1:{server.server_port}/',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
