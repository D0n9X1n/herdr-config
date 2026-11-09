# shellcheck shell=bash
# safe_rm <path>: the only way tests delete files.
# It refuses unless <path> is an existing directory (not a symlink) whose realpath sits
# strictly under $(realpath "${SAFE_RM_BASE:-/private/tmp}"), whose basename starts with
# `apollo-test.` or `live-test.`, and which is not /, $HOME (or a parent of it), this repo's
# root, a parent of this repo, or the current directory (or a parent of it).
# Source this file from bash or zsh; never export TMPDIR.

# This file's path in bash or zsh (zsh's %x is the file being sourced). Unknown → no repo → refuse all.
_SAFE_RM_SELF=""
if [ -n "${BASH_VERSION:-}" ]; then _SAFE_RM_SELF=${BASH_SOURCE[0]:-}
elif [ -n "${ZSH_VERSION:-}" ]; then eval '_SAFE_RM_SELF=${(%):-%x}'
fi
_SAFE_RM_REPO=""
if [ -n "$_SAFE_RM_SELF" ]; then
  _SAFE_RM_REPO=$(cd "$(dirname "$_SAFE_RM_SELF")/../.." 2>/dev/null && pwd -P) || _SAFE_RM_REPO=""
fi

_safe_rm_refuse() { echo "safe_rm: refusing ${1:-<empty>}: $2" >&2; return 1; }

# _safe_rm_within <child> <parent>: true when child == parent or child is under parent.
_safe_rm_within() { [ "$1" = "$2" ] || case "$1/" in "$2"/*) return 0 ;; *) return 1 ;; esac; }

safe_rm() {
  local p=${1-} base real name h cwd
  [ -n "$p" ] || { _safe_rm_refuse "" "empty path"; return 1; }
  [ "$#" -eq 1 ] || { _safe_rm_refuse "$p" "takes exactly one path"; return 1; }
  [ ! -L "$p" ] || { _safe_rm_refuse "$p" "is a symlink"; return 1; }
  [ -d "$p" ] || { _safe_rm_refuse "$p" "not an existing directory"; return 1; }
  [ -n "$_SAFE_RM_REPO" ] || { _safe_rm_refuse "$p" "cannot locate the repo root"; return 1; }
  base=$(realpath "${SAFE_RM_BASE:-/private/tmp}" 2>/dev/null) || { _safe_rm_refuse "$p" "base missing"; return 1; }
  [ -n "$base" ] && [ "$base" != / ] || { _safe_rm_refuse "$p" "base is /"; return 1; }
  real=$(realpath "$p" 2>/dev/null) || { _safe_rm_refuse "$p" "realpath failed"; return 1; }
  [ -n "$real" ] && [ "$real" != / ] || { _safe_rm_refuse "$p" "is /"; return 1; }
  case "$real/" in "$base"/?*) ;; *) _safe_rm_refuse "$p" "not under $base"; return 1 ;; esac
  name=${real##*/}
  case "$name" in apollo-test.?* | live-test.?*) ;; *) _safe_rm_refuse "$p" "basename $name lacks apollo-test./live-test."; return 1 ;; esac
  if [ -n "${HOME:-}" ]; then
    h=$(realpath "$HOME" 2>/dev/null) || h=$HOME
    if _safe_rm_within "$h" "$real"; then _safe_rm_refuse "$p" "is or contains \$HOME"; return 1; fi
  fi
  if _safe_rm_within "$_SAFE_RM_REPO" "$real"; then _safe_rm_refuse "$p" "is or contains the repo $_SAFE_RM_REPO"; return 1; fi
  cwd=$(pwd -P 2>/dev/null) || cwd=""
  if [ -n "$cwd" ] && _safe_rm_within "$cwd" "$real"; then _safe_rm_refuse "$p" "is or contains the current directory"; return 1; fi
  rm -rf -- "$real"
}
