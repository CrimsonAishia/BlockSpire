#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
方块尖塔 (BlockSpire) 一键编译部署脚本
功能：
1. 自动执行前端编译 (npm run build)
2. 校验构建产物完整性
3. 将 dist 快速打包压缩并通过 SFTP 传输至 Linux 服务器
4. 清除远程网站目录中旧的 dist 文件夹并解压部署（支持 sudo 提权）
"""

import os
import sys
import time
import tarfile
import tempfile
import subprocess
import getpass
import argparse
from typing import Tuple

# 自动检查并安装 paramiko 库
try:
    import paramiko
except ImportError:
    print("[提示] 检测到未安装 paramiko 库，正在自动安装...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko"])
    import paramiko


# 本地路径
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
LOCAL_DIST_DIR = os.path.join(PROJECT_ROOT, "dist")

# 自动加载本地 .env.deploy 或 .env（若存在）
for _env_name in [".env.deploy", ".env"]:
    _env_path = os.path.join(PROJECT_ROOT, _env_name)
    if os.path.exists(_env_path):
        try:
            with open(_env_path, "r", encoding="utf-8") as _f:
                for _line in _f:
                    _line = _line.strip()
                    if _line and not _line.startswith("#") and "=" in _line:
                        _k, _v = _line.split("=", 1)
                        _v = _v.strip()
                        if not (_v.startswith('"') or _v.startswith("'")):
                            _v = _v.split("#", 1)[0].strip()
                        else:
                            _v = _v.strip("'\"")
                        os.environ.setdefault(_k.strip(), _v)
        except Exception:
            pass

# ==============================================================================
#                               配置区
# ==============================================================================
# 服务器连接信息（可直接在此修改，或写在 .env.deploy 文件中）
SERVER_HOST = os.getenv("DEPLOY_HOST", "YOUR_SERVER_IP")  # 请替换为服务器实际 IP 或域名
SERVER_PORT = int(os.getenv("DEPLOY_PORT", "22"))
SERVER_USER = os.getenv("DEPLOY_USER", "aishia")
SERVER_PASSWORD = os.getenv("DEPLOY_PASSWORD", "")        # 服务器登录密码（留空将在运行时交互提示）
SSH_KEY_PATH = os.getenv("DEPLOY_KEY", "")                # 私钥路径（如使用密钥登录，例如 "C:/Users/.../.ssh/id_rsa"）

# sudo 权限配置（默认开启，解决 1Panel/Nginx 目录权限不足问题）
USE_SUDO = os.getenv("DEPLOY_USE_SUDO", "true").lower() in ("true", "1", "yes")
SUDO_PASSWORD = os.getenv("DEPLOY_SUDO_PASSWORD", "")     # sudo 密码（留空则默认复用登录密码或运行时提示）

# 远程部署目标路径配置
# 默认基准目录（支持在 .env.deploy 中通过 DEPLOY_REMOTE_DIR 覆盖）
DEFAULT_REMOTE_DIR = "/home/aishia/Develop/1panel/apps/openresty/openresty/www/sites/gBlockSpire.aishia.cc/index"
DEPLOY_REMOTE_DIR = os.getenv("DEPLOY_REMOTE_DIR", DEFAULT_REMOTE_DIR).strip()
# 是否在目标目录下保留/附加 dist 子目录（默认 false: 直接解压到目标目录；true: 解压到 dist 子目录）
DEPLOY_WITH_DIST = os.getenv("DEPLOY_WITH_DIST", "false").strip().lower() in ("true", "1", "yes")

# 受保护的系统关键目录，防止配置失误导致误删
DANGEROUS_DIRS = {
    "", "/", "/root", "/home", "/var", "/var/www", "/etc", "/usr", "/bin", "/sbin", "/lib", "/opt", "/tmp", "/dev"
}
# ==============================================================================


def log(msg: str):
    now = time.strftime("%H:%M:%S")
    print(f"[{now}] {msg}")


def validate_remote_dir(path: str) -> str:
    """校验远程路径合法性与安全性，防止危险删除操作"""
    cleaned = path.strip().rstrip("/")
    if not cleaned or not cleaned.startswith("/"):
        log(f"[错误] 远程部署路径必须是 Linux 绝对路径 (以 '/' 开头): '{path}'")
        sys.exit(1)
    if cleaned in DANGEROUS_DIRS or cleaned.count("/") < 2:
        log(f"[错误] 远程部署路径 '{cleaned}' 属于系统根目录或受保护目录，为防止误删已拒绝执行！")
        sys.exit(1)
    return cleaned


def resolve_deploy_paths(cli_remote_dir: str = None, cli_with_dist: bool = None) -> Tuple[str, bool, str]:
    """计算远程基准目录、是否包含 dist 以及最终目标目录"""
    base_dir = cli_remote_dir or DEPLOY_REMOTE_DIR
    base_dir = validate_remote_dir(base_dir)

    with_dist = DEPLOY_WITH_DIST if cli_with_dist is None else cli_with_dist
    if with_dist:
        target_dir = base_dir if base_dir.endswith("/dist") else f"{base_dir}/dist"
    else:
        target_dir = base_dir

    return base_dir, with_dist, target_dir


def check_prerequisites():
    """检查运行环境是否处于项目根目录"""
    package_json = os.path.join(PROJECT_ROOT, "package.json")
    if not os.path.exists(package_json):
        log(f"[错误] 未在当前目录下找到 package.json，请在项目根目录运行此脚本！")
        sys.exit(1)


def build_project():
    """执行本地编译"""
    log("====== 步骤 1/4: 执行前端编译 (npm run build) ======")
    start_time = time.time()
    
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    cmd = [npm_cmd, "run", "build"]
    
    log(f"运行命令: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=PROJECT_ROOT, shell=(sys.platform == "win32"))
    if result.returncode != 0:
        log("\n[错误] 前端编译失败，终止发布流程。")
        sys.exit(1)
        
    if not os.path.exists(LOCAL_DIST_DIR) or not os.listdir(LOCAL_DIST_DIR):
        log("\n[错误] 编译完成但未检测到有效 dist 产物目录！")
        sys.exit(1)
        
    duration = time.time() - start_time
    log(f"[成功] 前端编译完成，耗时 {duration:.2f} 秒\n")


def create_tar_archive() -> str:
    """将 local dist 目录打包为 tar.gz，极大加速 SFTP 传输并保证原子性解压"""
    log("====== 步骤 2/4: 压缩 dist 产物 ======")
    temp_tar = os.path.join(tempfile.gettempdir(), f"blockspire_dist_{int(time.time())}.tar.gz")
    
    with tarfile.open(temp_tar, "w:gz") as tar:
        for item in os.listdir(LOCAL_DIST_DIR):
            item_path = os.path.join(LOCAL_DIST_DIR, item)
            tar.add(item_path, arcname=item)
            
    tar_size_mb = os.path.getsize(temp_tar) / (1024 * 1024)
    log(f"[成功] 已生成压缩包: {temp_tar} ({tar_size_mb:.2f} MB)\n")
    return temp_tar


def get_ssh_client() -> Tuple[paramiko.SSHClient, str]:
    """建立 SSH 连接，并返回 (ssh_client, used_password)"""
    log(f"====== 步骤 3/4: 连接目标服务器 {SERVER_USER}@{SERVER_HOST}:{SERVER_PORT} ======")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    connect_kwargs = {
        "hostname": SERVER_HOST,
        "port": SERVER_PORT,
        "username": SERVER_USER,
        "timeout": 15,
        "banner_timeout": 30,
    }

    used_password = SERVER_PASSWORD
    if SSH_KEY_PATH and os.path.exists(SSH_KEY_PATH):
        connect_kwargs["key_filename"] = SSH_KEY_PATH
    else:
        if not used_password and SERVER_HOST != "YOUR_SERVER_IP":
            try:
                used_password = getpass.getpass(f"请输入 [{SERVER_USER}@{SERVER_HOST}] 的 SSH 登录密码: ")
            except KeyboardInterrupt:
                print("\n操作已取消。")
                sys.exit(0)
        connect_kwargs["password"] = used_password
        connect_kwargs["look_for_keys"] = True

    try:
        ssh.connect(**connect_kwargs)
        log("[成功] SSH 连接已建立！\n")
        return ssh, used_password
    except Exception as e:
        log(f"[错误] 连接服务器失败: {e}")
        if SERVER_HOST == "YOUR_SERVER_IP":
            log("提示：请在 deploy.py 或 .env.deploy 中将 SERVER_HOST 修改为您实际的服务器 IP。")
        sys.exit(1)


def deploy_to_remote(ssh: paramiko.SSHClient, local_tar: str, auth_password: str, target_dir: str):
    """上传文件并执行远程替换部署（支持 sudo）"""
    log(f"====== 步骤 4/4: 上传产物并更新远程目录 ({target_dir}) ======")
    remote_tar = f"/tmp/blockspire_dist_{int(time.time())}.tar.gz"
    
    # 1. SFTP 上传压缩包至世界可写的 /tmp 目录
    sftp = ssh.open_sftp()
    try:
        log(f"-> 正在通过 SFTP 上传到远程 {remote_tar} ...")
        sftp.put(local_tar, remote_tar)
        log("-> 上传完毕！")
    finally:
        sftp.close()

    # 确定 sudo 密码
    sudo_password = SUDO_PASSWORD or auth_password
    if USE_SUDO and not sudo_password:
        try:
            sudo_password = getpass.getpass(f"请输入 [{SERVER_USER}] 的 sudo 提权密码（若免密请直接回车）: ")
        except KeyboardInterrupt:
            print("\n操作已取消。")
            sys.exit(0)

    # 2. 远程执行清理旧目录、创建目录、解压新产物
    deploy_commands = [
        f"rm -rf '{target_dir}'",
        f"mkdir -p '{target_dir}'",
        f"tar -xzf '{remote_tar}' -C '{target_dir}'",
        f"rm -f '{remote_tar}'",
        f"chmod -R 755 '{target_dir}'",
    ]
    
    inner_cmd = " && ".join(deploy_commands)
    if USE_SUDO:
        # 使用 sudo -S 从标准输入读取密码，并由 root shell 一并执行操作
        combined_cmd = f"sudo -S -p '' bash -c \"{inner_cmd}\""
        log(f"-> 正在以 sudo 权限更新远程目录并解压到 '{target_dir}'...")
    else:
        combined_cmd = inner_cmd
        log(f"-> 正在执行远程部署命令，解压到 '{target_dir}'...")

    stdin, stdout, stderr = ssh.exec_command(combined_cmd)
    
    if USE_SUDO and sudo_password:
        stdin.write(f"{sudo_password}\n")
        stdin.flush()

    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8').strip()
    err = stderr.read().decode('utf-8').strip()
    
    if exit_status == 0:
        log(f"[成功] 远程目录已更新: {target_dir}")
        if out:
            print(out)
    else:
        log(f"[错误] 远程部署执行失败 (Exit code {exit_status})")
        if err:
            print(f"错误详情: {err}")
        sys.exit(1)


def parse_args() -> argparse.Namespace:
    """解析命令行参数"""
    parser = argparse.ArgumentParser(description="方块尖塔 (BlockSpire) 一键编译部署脚本")
    parser.add_argument(
        "--remote-dir",
        type=str,
        default=None,
        help="远程部署目标目录 (覆盖 DEPLOY_REMOTE_DIR 配置)"
    )
    dist_group = parser.add_mutually_exclusive_group()
    dist_group.add_argument(
        "--with-dist",
        action="store_true",
        default=None,
        help="解压时在目标目录后附加 dist 子目录"
    )
    dist_group.add_argument(
        "--no-dist",
        action="store_true",
        help="解压时直接解压到目标目录，不包含 dist 子目录"
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="跳过 npm run build 前端编译步骤，直接打包现有本地 dist"
    )
    return parser.parse_args()


def main():
    start_total = time.time()
    check_prerequisites()
    
    # 解析命令行参数（可选覆盖环境变量）
    args = parse_args()
    cli_with_dist = False if args.no_dist else (True if args.with_dist else None)
    remote_base_dir, with_dist, target_dir = resolve_deploy_paths(args.remote_dir, cli_with_dist)
    
    log(f"远程基准目录: {remote_base_dir}")
    log(f"包含 dist 目录: {'是' if with_dist else '否'}")
    log(f"最终解压目标: {target_dir}")
    
    local_tar = None
    ssh = None
    try:
        if not args.skip_build:
            build_project()
        else:
            log("====== 步骤 1/4: [跳过] 前端编译 (--skip-build) ======")
            if not os.path.exists(LOCAL_DIST_DIR) or not os.listdir(LOCAL_DIST_DIR):
                log("\n[错误] 未检测到本地 dist 产物目录！请先编译后再使用 --skip-build。")
                sys.exit(1)
                
        local_tar = create_tar_archive()
        ssh, auth_password = get_ssh_client()
        deploy_to_remote(ssh, local_tar, auth_password, target_dir)
        
        total_time = time.time() - start_total
        print("=" * 60)
        log(f"🎉 全部发布流程圆满成功！总耗时: {total_time:.2f} 秒")
        log(f"📂 远程目标路径: {target_dir}")
        log(f"🌐 站点访问地址: https://gBlockSpire.aishia.cc")
        print("=" * 60)
    finally:
        # 清理本地临时压缩包
        if local_tar and os.path.exists(local_tar):
            try:
                os.remove(local_tar)
            except OSError:
                pass
        if ssh:
            ssh.close()


if __name__ == "__main__":
    main()
