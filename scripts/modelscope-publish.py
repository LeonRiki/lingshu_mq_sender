#!/usr/bin/env python3
"""Upload the generated ModelScope runtime package.

Authentication is read from the local ModelScope CLI credential store. No token
is written into the repository or the generated update package.
"""

import argparse
from pathlib import Path

from modelscope.hub.api import HubApi


def main():
    parser = argparse.ArgumentParser(description="Publish the ModelScope update package")
    parser.add_argument("--directory", required=True, help="Generated modelscope package directory containing v1/")
    parser.add_argument("--version", required=True, help="Release version")
    parser.add_argument("--repo", default="LeonRiki/lingshu_mq", help="ModelScope model repository")
    args = parser.parse_args()

    directory = Path(args.directory)
    if not directory.is_dir():
        raise SystemExit(f"发布目录不存在：{directory}")

    HubApi().upload_folder(
        repo_id=args.repo,
        folder_path=str(directory),
        repo_type="model",
        commit_message=f"release: v{args.version}",
    )
    print(f"魔搭更新源已发布 v{args.version}")


if __name__ == "__main__":
    main()
