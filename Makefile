GO ?= go
export GOPATH := $(CURDIR)/vendor
.PHONY: build deploy

build:
	mv ~/rpmbuild ~/rpmbuild.bk.`date +'%d.%m.%y-%H:%M:%S'` || true
	./buildrpm.sh gtd.spec
	rm -rf build
	mkdir build
	cp ~/rpmbuild/RPMS/x86_64/*.rpm build
