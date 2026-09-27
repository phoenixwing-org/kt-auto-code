#!/bin/sh

# Load with: . ./tools/envSet-linux.sh

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=${ROOT_DIR:-$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)}
SDK_PREFIX=${SDK_PREFIX:-kt}
ROOT_DIR_CORE=${ROOT_DIR_CORE:-$ROOT_DIR/$SDK_PREFIX/core}
ROOT_DIR_INCLUDE=${ROOT_DIR_INCLUDE:-$ROOT_DIR/$SDK_PREFIX/core/include}
ROOT_DIR_3rdParty=${ROOT_DIR_3rdParty:-$ROOT_DIR/3rdParty}
CAA_MK_VERSION=${CAA_MK_VERSION:-19}

export ROOT_DIR SDK_PREFIX ROOT_DIR_CORE ROOT_DIR_INCLUDE ROOT_DIR_3rdParty CAA_MK_VERSION

printf '%s\n' "ROOT_DIR=$ROOT_DIR"
printf '%s\n' "ROOT_DIR_CORE=$ROOT_DIR_CORE"
printf '%s\n' "ROOT_DIR_INCLUDE=$ROOT_DIR_INCLUDE"
printf '%s\n' "ROOT_DIR_3rdParty=$ROOT_DIR_3rdParty"
printf '%s\n' "CAA_MK_VERSION=$CAA_MK_VERSION"
