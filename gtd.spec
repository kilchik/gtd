# GENERATED BY deploy/make.py

License:        GPL
Group:          Applications/Productivity
Source0:        %{source_name}.tar.gz
BuildRoot:      %{_tmppath}/%{source_name}
Name:           gtd
Version:        1.0.0
%define _rel    0
Release:        %{_rel}%{version_suffix}
Group:          System Environment/Libraries
Summary:        web service for monitoring regular tasks completion


Requires(post): systemd
Requires(preun): systemd
Requires(postun): systemd
BuildRequires: systemd

%description
web service for monitoring regular tasks completion
https://github.com/kilchik/gtd
Git version: %{git_version} (branch: %{git_branch})
Go version: %{go_version}

%define  debug_package %{nil}

%define __bindir        /usr/sbin
%define __etcdir        /etc/%{name}
%define __logdir        /var/log/%{name}/
%define __rundir        /var/run/%{name}/
%define __src           *.go
%define __srcdir        *.go
%define __datadir       %{nil}
%define __confdir       /etc/%{name}
%define __repourl       github.com/kilchik/%{name}
%define __staticdir     /usr/share/%{name}/static

%define gtd_home %{_localstatedir}/cache/gtd
%define gtd_user gtd
%define gtd_group gtd
%define gtd_loggroup adm

%pre
# Add the "gtd" user
getent group %{gtd_group} >/dev/null || groupadd -r %{gtd_group}
getent passwd %{gtd_user} >/dev/null || \
    useradd -r -g %{gtd_group} -s /sbin/nologin \
    -d %{gtd_home} -c "gtd user"  %{gtd_user}
exit 0

%prep
rm -rf %{buildroot}
%setup -q -n %{source_name}

%build
cd ..
cd %{source_name}
SRC_ROOT=$(pwd)
echo $SRC_ROOT

BUILDDIR=$(pwd)/build
mkdir -p $BUILDDIR

export GOPATH="$SRC_ROOT"
go get -u github.com/golang/dep/cmd/dep
go get -d %{__repourl}
cd src/%{__repourl}
$GOPATH/bin/dep ensure
go build -o $BUILDDIR/%{name} 
cd $SRC_ROOT

%install
[ "%{buildroot}" != "/" ] && rm -fr %{buildroot}
%{__mkdir} -p %{buildroot}%{__bindir}
%{__mkdir} -p %{buildroot}%{__etcdir}
%{__mkdir} -p %{buildroot}%{__logdir}
%{__mkdir} -p %{buildroot}%{__rundir}
%{__mkdir} -p %{buildroot}%{__confdir}
%{__mkdir} -p %{buildroot}%{__staticdir}
[ "%{__datadir}" != "" ] && %{__mkdir} -p %{buildroot}%{__datadir}

%{__install} -pD -m 755 build/%{name}  %{buildroot}/%{__bindir}/%{name}
%{__install} -pD -m 644 gtd.conf  %{buildroot}/%{__confdir}
cp -r src/%{__repourl}/static/*  %{buildroot}/%{__staticdir}

%{__mkdir} -p %{buildroot}/usr/lib/systemd/system/
%{__install} -pD -m 644 src/%{__repourl}/%{name}.service %{buildroot}/usr/lib/systemd/system/%{name}.service

%clean
rm -rf $RPM_BUILD_ROOT

%post
%systemd_post %{name}.service
systemctl daemon-reload >/dev/null 2>&1 || :

%preun
%systemd_preun %{name}.service

%postun
%systemd_postun %{name}.service

%files
%{__bindir}/%{name}
%attr(0755, gtd, gtd) %dir %{__rundir}
%attr(0755, gtd, gtd) %dir %{__logdir}
%attr(0755, gtd, gtd) %dir %{__staticdir}
%if "%{__datadir}" != ""
	%attr(0755, gtd, gtd) %dir %{__datadir}
%endif
%{__staticdir}/css/bootstrap.css
%{__staticdir}/css/style.css
%{__staticdir}/html/index.html
%{__staticdir}/images/evo.png
%{__staticdir}/js/script.js
/usr/lib/systemd/system/%{name}.service
%{__confdir}/%{name}.conf

%config(noreplace) %{__confdir}/%{name}.conf
