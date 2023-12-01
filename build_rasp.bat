@ECHO OFF

ECHO #### Cleaning Release...
	set Releasefolder="%~dp0release"
	cd /d %Releasefolder%
	for /F "delims=" %%i in ('dir /b') do @IF EXIST "%%i" (del "%%i" /s/q)
	for /F "delims=" %%i in ('dir /b') do @IF EXIST "%%i" (rmdir "%%i" /s/q || del "%%i" /s/q)
	ECHO #### Cleaning Release...done

ECHO #### Publishing NervboxDeamon...
	set deamonFolder="%~dp0NervboxDeamon"
	cd /d %deamonFolder%
	dotnet publish -o %Releasefolder% --self-contained -r linux-arm64
	ECHO #### Publishing NervboxDeamon...done
	
ECHO #### Creating wwwroot folder...
	set wwwrootFolder="%~dp0release\wwwroot"
	mkdir %wwwrootFolder%
	ECHO #### Creating wwwroot folder...done

ECHO #### Publish NervboxUI...
	set uiFolder="%~dp0NervboxUI"
	cd /d %uiFolder%
	call npm run build:prod
	ECHO #### Publish NervboxUI...done

ECHO #### Copy NervboxUI to release\wwwroot...
	xcopy %uiFolder%\dist\*.* %wwwrootFolder% /sy
	ECHO #### Copy NervboxUI to release\wwwroot...done

ECHO #### Copy DOCS to release...
	set docsSourceFolder="%~dp0NervboxDeamon\docs"
	set docsTargetFolder="%~dp0release\docs"
	mkdir %docsTargetFolder%
	xcopy %docsSourceFolder%\*.* %docsTargetFolder% /sy
	ECHO #### Copy DOCS to release...done		
	
ECHO #### Copy CHANGELOG to release...
	set historySource="%~dp0"
	set historyTarget="%~dp0release\docs"
	mkdir %historyTarget%
	xcopy %historySource%CHANGELOG.txt %historyTarget% /y
	ECHO #### Copy CHANGELOG to release...done			
	
cd /d %~dp0

PAUSE