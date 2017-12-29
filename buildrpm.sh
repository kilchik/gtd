#!/bin/bash
set -xe

SPECFILE=$1

err() {
  exitval="$1"
  shift
  echo "$@" > /dev/stderr
  exit $exitval
}

echo "Building \"$1\""
if [[ ! -f "$1" ]]; then
  err 1 "Spec \"$1\" not found"
fi

shift

DEBUG_PKG=FALSE
key="$1"
if [[ $key == "-d" ]]; then
  DEBUG_PKG=TRUE
  shift
fi

GIT_VERSION="$(git rev-parse HEAD)"
GIT_VERSION_SHORT="$(git rev-parse --short HEAD)"
EXTENDED_VERSION="$(git log -n 1 --pretty=format:'%h (%ai)')"
BRANCH="$(git name-rev --name-only HEAD)"
BRANCH_FOR_RPM="$(echo $BRANCH | rev | cut -d/ -f1 | rev | sed 's/-/_/g')"
PACKAGER="$(git config user.name) <$(git config user.email)>"
LAST_COMMIT_DATETIME="$(git log -n 1 --format='%ci' | awk '{ print $1, $2 }' | sed 's/[ :]//g;s/-//g')"
CURRENT_DATETIME="$(date +'%Y%m%d%H%M%S')"
GO_VERSION="$(go version | cut -d ' ' -f 3 | sed 's/[a-z]//g')"

if [[ ! -f "$HOME/.rpmmacros" ]]; then
   echo "%_topdir $HOME/rpmbuild/" > $HOME/.rpmmacros
   echo "%_tmppath $HOME/rpmbuild/tmp" >> $HOME/.rpmmacros
   echo "%packager ${PACKAGER}" >> $HOME/.rpmmacros

fi
if [[ ! -d "$HOME/rpmbuild" ]]; then
  echo "Creating directories need by rpmbuild"
  mkdir -p ~/rpmbuild/{BUILD,RPMS,SOURCES,SRPMS,SPECS,tmp} 2>/dev/null
  mkdir ~/rpmbuild/RPMS/{i386,i586,i686,noarch} 2>/dev/null
fi

SOURCE_NAME=go-${GIT_VERSION_SHORT}

RPM_TOPDIR="$(rpm --eval '%_topdir')"
BUILDROOT="$(rpm --eval '%_tmppath')"
BUILDROOT="$BUILDROOT/tmp/${SOURCE_NAME}"

mkdir -p ${RPM_TOPDIR}/{BUILD,RPMS,SOURCES,SRPMS,SPECS}
mkdir -p ${RPM_TOPDIR}/RPMS/{i386,i586,i686,noarch}
mkdir -p $BUILDROOT

mkdir ${SOURCE_NAME}
cd ${SOURCE_NAME}
GOPATH=$(pwd) go get github.com/kilchik/gtd
cp ../gtd.conf .
cd ..
tar -zcvf ${RPM_TOPDIR}/SOURCES/${SOURCE_NAME}.tar.gz ${SOURCE_NAME}

echo '############################################################'

VERSION_SUFFIX="%{nil}" # this protects against RPM's error "macro has empty body"
if [[ "${BRANCH_FOR_RPM}" != "master" ]]; then
  VERSION_SUFFIX=".${BRANCH_FOR_RPM}.${LAST_COMMIT_DATETIME}"
fi

echo "${SOURCE_NAME}"

rpmbuild -bb --clean $SPECFILE \
  --define "current_datetime ${CURRENT_DATETIME}" \
  --define "version_suffix ${VERSION_SUFFIX}" \
  --define "git_version ${GIT_VERSION}" \
  --define "git_branch ${BRANCH_FOR_RPM}" \
  --define "source_name ${SOURCE_NAME}" \
  --define "debug_pkg ${DEBUG_PKG}" \
  --define "go_version ${GO_VERSION}"
