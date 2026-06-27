"""Shared helpers for bitcoin-core container entrypoint and healthcheck."""

from __future__ import annotations

import os
import pwd
import re
import shutil
import subprocess
from pathlib import Path

DATADIR = Path('/home/bitcoin/.bitcoin')
CONFIG_SRC = Path('/config/bitcoin.conf')
CONF = DATADIR / 'bitcoin.conf'

CHAIN_PATTERN = re.compile(r'^\s*chain\s*=\s*(.+?)\s*$', re.IGNORECASE)


def read_chain_from_conf(conf_path: Path = CONF) -> str | None:
    if not conf_path.is_file():
        return None

    chain: str | None = None
    for line in conf_path.read_text(encoding='utf-8').splitlines():
        match = CHAIN_PATTERN.match(line)
        if match:
            chain = match.group(1).strip()
    return chain


def is_non_main_chain(chain: str | None) -> bool:
    return bool(chain and chain not in {'main', 'mainnet'})


def bitcoin_cli_command(*cli_args: str, conf_path: Path = CONF, datadir: Path = DATADIR) -> list[str]:
    chain = read_chain_from_conf(conf_path)
    command = [
        'bitcoin-cli',
        f'-datadir={datadir}',
        f'-conf={conf_path}',
        *cli_args,
    ]
    if is_non_main_chain(chain):
        command.insert(3, f'-chain={chain}')
    return command


def bitcoind_command(*daemon_args: str, conf_path: Path = CONF) -> list[str]:
    chain = read_chain_from_conf(conf_path)
    command = ['bitcoind', '-printtoconsole', f'-conf={conf_path}', *daemon_args]
    if is_non_main_chain(chain):
        command.insert(3, f'-chain={chain}')
    return command


def _bitcoin_user() -> pwd.struct_passwd:
    return pwd.getpwnam('bitcoin')


def chown_datadir_to_bitcoin(datadir: Path = DATADIR) -> None:
    if os.getuid() != 0:
        return
    try:
        pw = _bitcoin_user()
    except KeyError:
        return
    subprocess.run(
        ['chown', '-R', f'{pw.pw_name}:{pw.pw_name}', str(datadir)],
        check=False,
    )


def run_as_bitcoin(args: list[str], **kwargs) -> subprocess.CompletedProcess[str]:
    if os.getuid() == 0 and shutil.which('gosu'):
        try:
            _bitcoin_user()
            return subprocess.run(['gosu', 'bitcoin', *args], **kwargs)
        except KeyError:
            pass
    return subprocess.run(args, **kwargs)


def popen_as_bitcoin(args: list[str], **kwargs) -> subprocess.Popen:
    if os.getuid() == 0 and shutil.which('gosu'):
        try:
            _bitcoin_user()
            return subprocess.Popen(['gosu', 'bitcoin', *args], **kwargs)
        except KeyError:
            pass

    if os.getuid() == 0:
        try:
            pw = _bitcoin_user()
        except KeyError:
            return subprocess.Popen(args, **kwargs)

        def preexec() -> None:
            os.setgid(pw.pw_gid)
            os.setuid(pw.pw_uid)

        return subprocess.Popen(args, preexec_fn=preexec, **kwargs)

    return subprocess.Popen(args, **kwargs)


def prepare_datadir() -> None:
    DATADIR.mkdir(parents=True, exist_ok=True)
    if CONFIG_SRC.is_file():
        shutil.copy2(CONFIG_SRC, CONF)
    settings_json = DATADIR / 'settings.json'
    if settings_json.exists():
        settings_json.unlink()
    chown_datadir_to_bitcoin()
