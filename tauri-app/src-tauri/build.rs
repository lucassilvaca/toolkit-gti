fn main() {
    #[cfg(windows)]
    {
        // `asInvoker`: no PC do usuário final (sem admin) o app sobe no logon
        // (HKLM Run, criado pelo MSI) só com bandeja + chat. Com
        // `requireAdministrator` o Windows não iniciava o app pelo Run e o
        // usuário sem admin nem conseguia abri-lo. O técnico eleva pela tela
        // "Área restrita" (`relaunch_as_admin`).
        let mut res = tauri_build::WindowsAttributes::new();
        res = res.app_manifest(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="asInvoker" uiAccess="false" />
      </requestedPrivileges>
    </security>
  </trustInfo>
  <dependency>
    <dependentAssembly>
      <assemblyIdentity
        type="win32"
        name="Microsoft.Windows.Common-Controls"
        version="6.0.0.0"
        processorArchitecture="amd64"
        publicKeyToken="6595b64144ccf1df"
        language="*"
      />
    </dependentAssembly>
  </dependency>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">
    <application>
      <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}" />
    </application>
  </compatibility>
</assembly>"#,
        );
        tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(res))
            .expect("failed to run tauri-build");
    }

    #[cfg(not(windows))]
    tauri_build::build()
}
